package ir.medora.health

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.time.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NotificationPrivacyTest {
    private val context=InstrumentationRegistry.getInstrumentation().targetContext
    private val manager=requireNotNull(context.getSystemService(NotificationManager::class.java))
    private val service=Reminders(context)
    private fun posted(id:Int,predicate:(Notification)->Boolean):Notification {
        val end=SystemClock.elapsedRealtime()+5000
        while(SystemClock.elapsedRealtime()<end) {
            val notification=manager.activeNotifications.find{it.id==id}?.notification
            if(notification!=null && predicate(notification)) return notification
            SystemClock.sleep(20)
        }
        error("Expected notification update was not observed")
    }
    @Test fun activeNotificationHidesAndRestoresDetailsWithoutChangingItsId() {
        assumeTrue("Grant notifications to the test app first",service.enabled())
        val now=ZonedDateTime.now()
        val time=now.minusMinutes(1).toLocalTime().withSecond(0).withNano(0).toString()
        val med=Medication(id="privacy-test",name="Private medicine",instructions="Private instructions",
            startDay=now.toLocalDate().toString(),times=listOf(time),icon=MedicationIcon.DROPS,color=MedicationColor.LAVENDER)
        val d=HealthData(settings=Settings(consent=true,privateNotifications=false),medications=mutableListOf(med))
        d.materialize(now)
        val r=Planner.plan(d,now.minusMinutes(2)).first{it.kind=="dose"}
        val id=1900000001
        try {
            service.show(r,d,id)
            posted(id){it.extras.getString(Notification.EXTRA_TITLE).orEmpty().contains(med.name)}.also {
                assertNotNull(it.getLargeIcon());assertEquals(MedicationColor.LAVENDER.argb,it.color)
                assertNull(it.publicVersion.getLargeIcon())
            }
            d.settings=d.settings.copy(privateNotifications=true)
            service.refreshActive(d,now)
            val hidden=posted(id){it.extras.getString(Notification.EXTRA_TITLE)==localizedText("notification.brand","fa")}
            assertNull(hidden.getLargeIcon())
            assertEquals(0,hidden.color)
            assertFalse(hidden.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString().contains(med.instructions))
            d.settings=d.settings.copy(privateNotifications=false)
            service.refreshActive(d,now)
            val restored=posted(id){it.extras.getString(Notification.EXTRA_TITLE).orEmpty().contains(med.name)}
            assertNotNull(restored.getLargeIcon())
            assertEquals(MedicationColor.LAVENDER.argb,restored.color)
            assertTrue(restored.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString().contains(med.instructions))
        } finally { manager.cancel(id) }
    }
    @Test fun legacyNotificationWithoutMetadataIsRedactedImmediately() {
        assumeTrue("Grant notifications to the test app first",service.enabled())
        val id=1900000002
        manager.createNotificationChannel(NotificationChannel("health-v2","Health",NotificationManager.IMPORTANCE_HIGH))
        try {
            manager.notify(id,Notification.Builder(context,"health-v2").setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Private legacy medicine").setContentText("Private legacy instructions")
                .setStyle(Notification.BigTextStyle().bigText("Private legacy instructions")).build())
            posted(id){it.extras.getString(Notification.EXTRA_TITLE)=="Private legacy medicine"}
            service.refreshActive(HealthData(settings=Settings(privateNotifications=true)),ZonedDateTime.now())
            val redacted=posted(id){it.extras.getString(Notification.EXTRA_TITLE)==localizedText("notification.brand","fa")}
            assertFalse(redacted.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString().contains("Private legacy"))
        } finally { manager.cancel(id) }
    }
}

