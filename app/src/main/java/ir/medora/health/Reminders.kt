package ir.medora.health

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.*
import android.util.Log
import java.time.*

private const val REMINDER_CHANNEL = "health-v2"
private const val FIRE_REMINDERS = "ir.medora.health.FIRE"
private const val RETRY_REMINDERS = "ir.medora.health.RETRY"
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
        (Build.VERSION.SDK_INT<33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED) &&
        !channelBlocked()
    fun channelBlocked():Boolean = notifications.getNotificationChannel(REMINDER_CHANNEL)?.importance == NotificationManager.IMPORTANCE_NONE
    fun exact():Boolean = Build.VERSION.SDK_INT<31 || alarms.canScheduleExactAlarms()
    private fun alarmIntent(action:String,recoverDue:Boolean=true):PendingIntent = PendingIntent.getBroadcast(context,1,
        Intent(context,ReminderReceiver::class.java).setAction(action).putExtra("recoverDue",recoverDue),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    internal fun retryRebuild(recoverDue:Boolean) {
        alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 60_000,
            alarmIntent(RETRY_REMINDERS,recoverDue))
    }
    fun rebuild(data:HealthData, recoverDue:Boolean = true):List<Reminder> {
        val repo=Repository.get(context)
        val now=ZonedDateTime.now()
        val nowMs=now.toInstant().toEpochMilli()
        val queuedAt=runCatching { repo.queue().minOfOrNull { it.at } }.getOrNull()
        val alarm = alarmIntent(FIRE_REMINDERS)
        if(!data.settings.consent || !enabled()) {
            alarms.cancel(alarm)
            repo.saveQueue(emptyList());notifications.cancelAll()
            data.reminderCheckpoint=nowMs;repo.save(data)
            alarms.cancel(alarmIntent(RETRY_REMINDERS))
            return emptyList()
        }
        // A persisted checkpoint recovers EVERY due slot, even when Doze skips
        // multiple slots before the single OS alarm is finally delivered.
        val due=if(recoverDue) Planner.overdue(data,now,queuedAt) else emptyList()
        due.forEach { data.notificationId("${it.kind}:${it.reference}") }
        repo.save(data) // Stable notification ids survive a crash before posting.
        val all=Planner.plan(data,now)
        val first=all.firstOrNull()
        val batch=if(first==null)emptyList() else all.takeWhile { it.at==first.at }
        repo.saveQueue(batch)
        if(first!=null) {
            try {
                if(exact()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,first.at,alarm)
                else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,first.at,alarm)
            } catch(_:SecurityException) { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,first.at,alarm) }
        } else alarms.cancel(alarm)
        refreshActive(data,now)
        data.medications.indices.forEach { index ->
            val medication=data.medications[index]
            val stock=medication.stock ?: return@forEach
            val low=data.lowStock(medication,now)
            if(low==stock.alerted) return@forEach
            if(low) {
                val key="stock:${medication.id}"
                val reminder=Planner.content(data,Reminder(key,"stock",medication.id,nowMs))
                val notificationId=data.notificationId(key)
                repo.save(data)
                if(!show(reminder,data,notificationId)) return@forEach
            }
            data.medications[index]=medication.copy(stock=stock.copy(alerted=low))
        }
        val allPosted = due.all { r ->
            if (!show(Planner.content(data,r),data,data.notificationIds.getValue("${r.kind}:${r.reference}"))) return@all false
            data.deliveredReminders[r.key]=r.at
            true
        }
        // Advance only after delivery succeeded. A failed post is retried from
        // the old checkpoint, using the same ids to avoid duplicate cards.
        if (allPosted) data.reminderCheckpoint=nowMs
        data.deliveredReminders.entries.removeAll { it.value<nowMs-Planner.RECOVERY_MILLIS }
        repo.save(data)
        alarms.cancel(alarmIntent(RETRY_REMINDERS))
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
    private fun publicNotification(language:String)=Notification.Builder(context,REMINDER_CHANNEL)
        .setSmallIcon(R.drawable.ic_notification).setContentTitle(localizedText("notification.brand",language))
        .setContentText(localizedText("notification.privateBody",language)).build()
    private fun action(r:Reminder,notificationId:Int,action:String):PendingIntent {
        val intent=Intent(context,ReminderReceiver::class.java).setAction("ir.medora.health.ACTION")
            .setData(Uri.parse("medora://action/${Uri.encode(r.key)}/${r.at}/$action"))
            .putExtra("key",r.key).putExtra("kind",r.kind).putExtra("reference",r.reference)
            .putExtra("at",r.at).putExtra("waterBase",r.waterBase).putExtra("action",action).putExtra("notificationId",notificationId)
        return PendingIntent.getBroadcast(context,notificationId,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    fun show(r:Reminder,data:HealthData,notificationId:Int,onlyAlertOnce:Boolean=false): Boolean {
        if(!enabled())return false
        val language=data.settings.language
        notifications.createNotificationChannel(NotificationChannel(
            REMINDER_CHANNEL, localizedText("notification.channel", language), NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description=localizedText("notification.channelDescription", language)
            lockscreenVisibility=Notification.VISIBILITY_PRIVATE
        })
        val open=PendingIntent.getActivity(context,notificationId,Intent(context,MainActivity::class.java).setAction("open:$notificationId"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val title=if(data.settings.privateNotifications)localizedText("notification.brand",language) else localizedNumber(r.title,language)
        val body=if(data.settings.privateNotifications)localizedText("notification.privateBody",language) else displayReminderBody(r.body,data.settings)
        val publicVersion=publicNotification(language)
        val builder=Notification.Builder(context,REMINDER_CHANNEL).setSmallIcon(R.drawable.ic_notification)
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
        if(r.kind=="water" || r.kind=="dose") {
            builder.addAction(Notification.Action.Builder(
                null,
                localizedText(if(r.kind=="water")"notification.actionWater" else "notification.actionTaken", language),
                action(r,notificationId,"done")
            ).build())
            builder.addAction(Notification.Action.Builder(
                null, localizedText("notification.actionSnooze",language,localizedNumber((if(r.kind=="dose") data.settings.medicationSnoozeMinutes else 10).toString(),language)), action(r,notificationId,"snooze")
            ).build())
        }
        notifications.notify(notificationId,builder.build())
        return true
    }
    fun cancel(id:Int)=notifications.cancel(id)
}
class ReminderReceiver:BroadcastReceiver() {
    override fun onReceive(context:Context,intent:Intent) = background(context,retryOnFailure=intent.action!=RETRY_REMINDERS) {
        val repo=Repository.get(context);val service=Reminders(context);val now=ZonedDateTime.now()
        if(intent.action=="ir.medora.health.ACTION") {
            val reminder=Reminder(intent.getStringExtra("key").orEmpty(),intent.getStringExtra("kind").orEmpty(),
                intent.getStringExtra("reference").orEmpty(),intent.getLongExtra("at",0),waterBase=intent.getStringExtra("waterBase").orEmpty())
            var accepted=false
            repo.update { d -> accepted=d.applyReminderAction(reminder,intent.getStringExtra("action").orEmpty(),now) }
            if(accepted) service.cancel(intent.getIntExtra("notificationId",0))
            service.rebuild(repo.read())
        } else {
            service.rebuild(repo.update { },recoverDue=intent.getBooleanExtra("recoverDue",true))
        }
    }
}
class RefreshReceiver:BroadcastReceiver() {
    override fun onReceive(context:Context,intent:Intent) {
        val notificationStateChanged = Build.VERSION.SDK_INT >= 28 && when (intent.action) {
            NotificationManager.ACTION_APP_BLOCK_STATE_CHANGED -> true
            NotificationManager.ACTION_NOTIFICATION_CHANNEL_BLOCK_STATE_CHANGED ->
                intent.getStringExtra(NotificationManager.EXTRA_NOTIFICATION_CHANNEL_ID) == REMINDER_CHANNEL
            else -> false
        }
        if(!notificationStateChanged && intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED,Intent.ACTION_MY_PACKAGE_REPLACED,Intent.ACTION_TIMEZONE_CHANGED,Intent.ACTION_TIME_CHANGED,"android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED")) return
        background(context, recoverDue=!notificationStateChanged) {
            val data=Repository.get(context).update { }
            Reminders(context).rebuild(data,recoverDue=!notificationStateChanged)
        }
    }
}
// A short wake lock protects the asynchronous disk operation after onReceive.
// No Flutter engine, service or continuously running timer is involved.
private fun BroadcastReceiver.background(context:Context,retryOnFailure:Boolean=true,recoverDue:Boolean=true,work:()->Unit) {
    val pending=goAsync()
    val lock=requireNotNull(context.getSystemService(PowerManager::class.java)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"medora:reminder").apply { acquire(9000) }
    Repository.executor.execute {
        try { work() } catch(_:Exception) {
            Log.w("MedoraReminders", "Background reminder processing failed")
            if (retryOnFailure) try {
                Reminders(context).retryRebuild(recoverDue)
            } catch (_:Exception) {
                Log.w("MedoraReminders", "Could not schedule reminder retry")
            }
        } finally { if(lock.isHeld)lock.release();pending.finish() }
    }
}


