package ir.medora.health

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.*
import java.time.*

private val reminderIsoDate = Regex("\\b\\d{4}-\\d{2}-\\d{2}\\b")

private fun displayReminderBody(body:String,settings:Settings):String = reminderIsoDate.replace(body) { match ->
    runCatching {
        CalendarSupport.formatDate(LocalDate.parse(match.value),settings.calendar,settings.language)
    }.getOrDefault(match.value)
}.let { localizedNumber(it,settings.language) }

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
        val now=ZonedDateTime.now()
        val nowMs=now.toInstant().toEpochMilli()
        val queuedAt=runCatching { repo.queue().minOfOrNull { it.at } }.getOrNull()
        alarms.cancel(alarmIntent())
        if(!data.settings.consent || !enabled()) {
            repo.saveQueue(emptyList());notifications.cancelAll()
            data.reminderCheckpoint=nowMs;repo.save(data)
            return emptyList()
        }
        // A persisted checkpoint recovers EVERY due slot, even when Doze skips
        // multiple slots before the single OS alarm is finally delivered.
        val due=Planner.overdue(data,now,queuedAt)
        due.forEach { data.notificationId("${it.kind}:${it.reference}") }
        repo.save(data) // Stable notification ids survive a crash before posting.
        val all=Planner.plan(data,now)
        val first=all.firstOrNull()
        val batch=if(first==null)emptyList() else all.takeWhile { it.at==first.at }
        repo.saveQueue(batch)
        if(first!=null) {
            try {
                if(exact()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,first.at,alarmIntent())
                else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,first.at,alarmIntent())
            } catch(_:SecurityException) { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,first.at,alarmIntent()) }
        }
        refreshActive(data,now)
        due.forEach { r ->
            show(Planner.content(data,r),data,data.notificationIds.getValue("${r.kind}:${r.reference}"))
            data.deliveredReminders[r.key]=r.at
        }
        // Advance only after delivery succeeded. A failed post is retried from
        // the old checkpoint, using the same ids to avoid duplicate cards.
        data.reminderCheckpoint=nowMs
        data.deliveredReminders.entries.removeAll { it.value<nowMs-Planner.RECOVERY_MILLIS }
        repo.save(data)
        return all
    }
    internal fun refreshActive(data:HealthData,now:ZonedDateTime) {
        notifications.activeNotifications.forEach { active ->
            val extras=active.notification.extras
            val kind=extras.getString("medora.kind")
            if(kind!=null) {
                val r=Reminder(extras.getString("medora.key").orEmpty(),kind,
                    extras.getString("medora.reference").orEmpty(),extras.getLong("medora.at"),
                    waterBase=extras.getString("medora.waterBase").orEmpty())
                if(!Planner.allowed(data,r,now)) notifications.cancel(active.id)
                else show(Planner.content(data,r),data,active.id,onlyAlertOnce=true)
            } else if(data.settings.privateNotifications) {
                // Upgrade path: pre-fix notifications lack our source metadata.
                // Remove their old health text immediately, without a new sound.
                val title=localizedText("notification.brand",data.settings.language)
                val body=localizedText("notification.privateBody",data.settings.language)
                notifications.notify(active.id,Notification.Builder.recoverBuilder(context,active.notification)
                    .setContentTitle(title).setContentText(body)
                    .setStyle(Notification.BigTextStyle().bigText(body)).setOnlyAlertOnce(true)
                    .setLargeIcon(null as android.graphics.Bitmap?).setColor(0)
                    .setPublicVersion(publicNotification(data.settings.language)).build())
            }
        }
    }
    private fun publicNotification(language:String)=Notification.Builder(context,"health-v2")
        .setSmallIcon(R.drawable.ic_notification).setContentTitle(localizedText("notification.brand",language))
        .setContentText(localizedText("notification.privateBody",language)).build()
    private fun action(r:Reminder,notificationId:Int,action:String):PendingIntent {
        val intent=Intent(context,ReminderReceiver::class.java).setAction("ir.medora.health.ACTION")
            .setData(Uri.parse("medora://action/${Uri.encode(r.key)}/${r.at}/$action"))
            .putExtra("key",r.key).putExtra("kind",r.kind).putExtra("reference",r.reference)
            .putExtra("at",r.at).putExtra("waterBase",r.waterBase).putExtra("action",action).putExtra("notificationId",notificationId)
        return PendingIntent.getBroadcast(context,notificationId,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    fun show(r:Reminder,data:HealthData,notificationId:Int,onlyAlertOnce:Boolean=false) {
        if(!enabled())return
        val language=data.settings.language
        notifications.createNotificationChannel(NotificationChannel(
            "health-v2", localizedText("notification.channel", language), NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description=localizedText("notification.channelDescription", language)
            lockscreenVisibility=Notification.VISIBILITY_PRIVATE
        })
        val open=PendingIntent.getActivity(context,notificationId,Intent(context,MainActivity::class.java).setAction("open:$notificationId"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val title=if(data.settings.privateNotifications)localizedText("notification.brand",language) else localizedNumber(r.title,language)
        val body=if(data.settings.privateNotifications)localizedText("notification.privateBody",language) else displayReminderBody(r.body,data.settings)
        val publicVersion=publicNotification(language)
        val builder=Notification.Builder(context,"health-v2").setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title).setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body)).setPublicVersion(publicVersion)
            .setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setOnlyAlertOnce(onlyAlertOnce || notifications.activeNotifications.any {
                it.id==notificationId && it.notification.extras.getString("medora.key")==r.key
            })
            .addExtras(Bundle().apply {
                putString("medora.key",r.key);putString("medora.kind",r.kind)
                putString("medora.reference",r.reference);putLong("medora.at",r.at)
                putString("medora.waterBase",r.waterBase)
            })
        if(r.kind=="dose" && !data.settings.privateNotifications) {
            val dose=data.doses.find { it.id==r.reference }
            val medication=data.medications.find { it.id==dose?.medicationId }
            if(dose!=null) {
                val icon=medication?.icon ?: dose.icon
                val color=medication?.color ?: dose.color
                builder.setLargeIcon(medicationIconBitmap(icon,color)).setColor(color.argb)
            }
        }
        if(r.kind!="appointment") {
            builder.addAction(Notification.Action.Builder(
                null,
                localizedText(if(r.kind=="water")"notification.actionWater" else "notification.actionTaken", language),
                action(r,notificationId,"done")
            ).build())
            builder.addAction(Notification.Action.Builder(
                null, localizedText("notification.actionSnooze",language), action(r,notificationId,"snooze")
            ).build())
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
            service.rebuild(repo.update { })
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

