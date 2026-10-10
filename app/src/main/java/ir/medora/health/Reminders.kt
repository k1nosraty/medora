package ir.medora.health

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.*
import java.time.*

class Reminders(private val context:Context) {
    private val alarms=requireNotNull(context.getSystemService(AlarmManager::class.java))
    private val notifications=requireNotNull(context.getSystemService(NotificationManager::class.java))
    fun enabled():Boolean = notifications.areNotificationsEnabled() &&
        (Build.VERSION.SDK_INT<33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
    fun exact():Boolean = Build.VERSION.SDK_INT<31 || alarms.canScheduleExactAlarms()
    private fun alarmIntent():PendingIntent = PendingIntent.getBroadcast(context,1,
        Intent(context,ReminderReceiver::class.java).setAction("ir.medora.health.FIRE"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun rebuild(data:HealthData):List<Reminder> {
        val repo=Repository.get(context)
        alarms.cancel(alarmIntent())
        if(!data.settings.consent || !enabled()) { repo.saveQueue(emptyList());notifications.cancelAll();return emptyList() }
        val all=Planner.plan(data,ZonedDateTime.now())
        val first=all.firstOrNull()
        val batch=if(first==null)emptyList() else all.takeWhile { it.at==first.at }
        // Store only the next batch. Each alarm schedules the next one, including
        // midnight maintenance; the OS alarm count stays bounded.
        repo.saveQueue(batch)
        if(first!=null) {
            try {
                if(exact()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,first.at,alarmIntent())
                else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,first.at,alarmIntent())
            } catch(_:SecurityException) { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,first.at,alarmIntent()) }
        }
        // Remove visible notifications whose source is now completed/deleted.
        data.notificationIds.forEach { (key,n) ->
            if(key.startsWith("dose:")) {
                val dose=data.doses.find { it.id==key.removePrefix("dose:") }
                if(dose==null || dose.status in setOf(DoseStatus.TAKEN,DoseStatus.SKIPPED) ||
                    data.medications.none { it.id==dose.medicationId && it.active }) notifications.cancel(n)
            }
            if(key.startsWith("water:") && (!data.settings.waterEnabled || key.removePrefix("water:") in data.waterAcknowledged ||
                data.total(java.time.LocalDate.now().toString())>=data.settings.goal)) notifications.cancel(n)
            if(key.startsWith("appointment:") && data.appointments.none { it.id==key.removePrefix("appointment:") && !it.cancelled }) notifications.cancel(n)
        }
        return all
    }
    private fun action(r:Reminder,notificationId:Int,action:String):PendingIntent {
        val intent=Intent(context,ReminderReceiver::class.java).setAction("ir.medora.health.ACTION")
            .setData(Uri.parse("medora://action/${Uri.encode(r.key)}/${r.at}/$action"))
            .putExtra("key",r.key).putExtra("kind",r.kind).putExtra("reference",r.reference)
            .putExtra("at",r.at).putExtra("waterBase",r.waterBase).putExtra("action",action).putExtra("notificationId",notificationId)
        return PendingIntent.getBroadcast(context,notificationId,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    fun show(r:Reminder,data:HealthData,notificationId:Int) {
        if(!enabled())return
        notifications.createNotificationChannel(NotificationChannel("health-v2","یادآوری‌های سلامت",NotificationManager.IMPORTANCE_HIGH).apply {
            description="آب، دارو و قرارها";lockscreenVisibility=Notification.VISIBILITY_PRIVATE
        })
        val open=PendingIntent.getActivity(context,notificationId,Intent(context,MainActivity::class.java).setAction("open:$notificationId"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val title=if(data.settings.privateNotifications)context.getString(R.string.reminder_title) else fa(r.title)
        val body=if(data.settings.privateNotifications)"برای جزئیات برنامه را باز کنید" else fa(r.body)
        val publicVersion=Notification.Builder(context,"health-v2").setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.reminder_title)).setContentText("برای جزئیات برنامه را باز کنید").build()
        val builder=Notification.Builder(context,"health-v2").setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title).setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body)).setPublicVersion(publicVersion)
            .setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setCategory(Notification.CATEGORY_REMINDER)
        if(r.kind!="appointment") {
            builder.addAction(Notification.Action.Builder(null,if(r.kind=="water")"ثبت ۲۵۰ میلی‌لیتر" else "مصرف کردم",action(r,notificationId,"done")).build())
            builder.addAction(Notification.Action.Builder(null,"۱۰ دقیقه بعد",action(r,notificationId,"snooze")).build())
        }
        notifications.notify(notificationId,builder.build())
    }
    fun cancel(id:Int)=notifications.cancel(id)
}
class ReminderReceiver:BroadcastReceiver() {
    override fun onReceive(context:Context,intent:Intent) = background(context) {
        val repo=Repository.get(context);val service=Reminders(context);val now=ZonedDateTime.now()
        if(intent.action=="ir.medora.health.ACTION") {
            val token="${intent.getStringExtra("key")}|${intent.getLongExtra("at",0)}|${intent.getStringExtra("action")}" 
            repo.update { d ->
                if(token !in d.handledActions) {
                    val ref=intent.getStringExtra("reference").orEmpty()
                    val done=intent.getStringExtra("action")=="done"
                    when(intent.getStringExtra("kind")) {
                        "dose" -> d.doses.find { it.id==ref }?.let { dose ->
                            if(dose.status!=DoseStatus.TAKEN && dose.status!=DoseStatus.SKIPPED)
                                d.mark(dose,if(done)DoseStatus.TAKEN else DoseStatus.SNOOZED,now.toInstant())
                        }
                        "water" -> {
                            val base=intent.getStringExtra("waterBase").orEmpty()
                            if(base.isNotEmpty() && base !in d.waterAcknowledged) {
                                if(done) { d.addWater(250,now);d.waterAcknowledged+=base;d.waterSnoozes.remove(base) }
                                else d.waterSnoozes[base]=now.toInstant().plusSeconds(600).toEpochMilli()
                            }
                        }
                    }
                    d.handledActions+=token
                    if(d.handledActions.size>500)d.handledActions.removeAt(0)
                }
            }
            service.cancel(intent.getIntExtra("notificationId",0));service.rebuild(repo.read())
        } else {
            val batch=repo.queue()
            val due=batch.filter { it.at<=now.toInstant().toEpochMilli()+1000 }
            val data=repo.update { d ->
                due.filter { Planner.allowed(d,it,now) }.forEach { r ->d.notificationId("${r.kind}:${r.reference}") }
            }
            service.rebuild(data)
            due.filter { Planner.allowed(data,it,now) }.forEach { r ->service.show(r,data,data.notificationIds.getValue("${r.kind}:${r.reference}")) }
        }
    }
}
class RefreshReceiver:BroadcastReceiver() {
    override fun onReceive(context:Context,intent:Intent)=background(context) {
        val data=Repository.get(context).update { }
        Reminders(context).rebuild(data)
    }
}
// A short wake lock protects the asynchronous disk operation after onReceive.
// No Flutter engine, service or continuously running timer is involved.
fun BroadcastReceiver.background(context:Context,work:()->Unit) {
    val pending=goAsync()
    val lock=requireNotNull(context.getSystemService(PowerManager::class.java)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"medora:reminder").apply { acquire(9000) }
    Repository.executor.execute {
        try { work() } catch(_:Exception) {
            // Do not log decrypted health information. An app-open refresh retries
            // failed queue rebuilding and shows the error to the user.
        } finally { if(lock.isHeld)lock.release();pending.finish() }
    }
}
