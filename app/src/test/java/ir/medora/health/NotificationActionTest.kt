package ir.medora.health

import java.time.*
import org.junit.Assert.*
import org.junit.Test

class NotificationActionTest {
    private val now=ZonedDateTime.of(2026,10,10,8,5,0,0,ZoneId.of("Asia/Tehran"))
    private fun data()=HealthData(settings=Settings(consent=true)).apply {
        val med=Medication(id="med",name="Medicine",startDay="2026-10-10",times=listOf("08:00"))
        medications+=med;doses+=Dose.of(med,now.toLocalDate(),"08:00")
    }
    private fun reminder(d:HealthData):Reminder {
        val dose=d.doses.single()
        return Reminder("dose|${dose.id}","dose",dose.id,LocalDateTime.parse(dose.wall).atZone(now.zone).toInstant().toEpochMilli())
    }
    @Test fun dueActionSucceedsExactlyOnce() {
        val d=data();val r=reminder(d)
        assertTrue(d.applyReminderAction(r,"done",now))
        assertEquals(DoseStatus.TAKEN,d.doses.single().status)
        assertFalse(d.applyReminderAction(r,"done",now))
        assertFalse(d.applyReminderAction(r,"snooze",now))
        assertEquals(1,d.handledActions.size)
    }
    @Test fun supersededNotificationCannotCompleteOrReplaceSnoozedDose() {
        val d=data();val r=reminder(d)
        assertTrue(d.applyReminderAction(r,"snooze",now))
        val snoozed=d.doses.single().snoozeUntil
        assertFalse(d.applyReminderAction(r,"done",now.plusMinutes(11)))
        assertEquals(snoozed,d.doses.single().snoozeUntil)
        assertTrue(d.applyReminderAction(r.copy(at=snoozed),"done",now.plusMinutes(11)))
    }
    @Test fun inactiveDeletedRescheduledAndFutureRemindersAreRejected() {
        for(mode in listOf("inactive","deleted","rescheduled","future","consent","invalid")) {
            val d=data();val r=reminder(d)
            when(mode) {
                "inactive" -> d.medications[0]=d.medications[0].copy(active=false)
                "deleted" -> d.medications.clear()
                "rescheduled" -> d.medications[0]=d.medications[0].copy(times=listOf("09:00"))
                "consent" -> d.settings=d.settings.copy(consent=false)
            }
            assertFalse(mode,d.applyReminderAction(if(mode=="future") r.copy(at=now.plusMinutes(1).toInstant().toEpochMilli()) else r,if(mode=="invalid") "delete" else "done",now))
            assertEquals(DoseStatus.PENDING,d.doses.single().status)
            assertTrue(d.handledActions.isEmpty())
        }
    }
    @Test fun waterActionRejectsOldSnoozeAndAcknowledgedNotifications() {
        val d=HealthData(settings=Settings(consent=true,waterEnabled=true))
        val r=Planner.plan(d,now.withHour(7),1).first { it.kind=="water" }
        val base=r.waterBase
        assertTrue(d.applyReminderAction(r,"snooze",now))
        val snoozed=d.waterSnoozes.getValue(base)
        assertFalse(d.applyReminderAction(r,"done",now.plusMinutes(11)))
        assertEquals(0,d.total("2026-10-10"))
        assertTrue(d.applyReminderAction(r.copy(at=snoozed),"done",now.plusMinutes(11)))
        assertEquals(250,d.total("2026-10-10"))
        assertFalse(d.applyReminderAction(r.copy(at=snoozed),"done",now.plusMinutes(11)))
    }
    @Test fun waterOutsideWindowAndAfterGoalCannotBeLoggedFromStaleNotification() {
        val d=HealthData(settings=Settings(consent=true,waterEnabled=true))
        val r=Planner.plan(d,now.withHour(7),1).first { it.kind=="water" }
        assertFalse(d.applyReminderAction(r,"done",now.withHour(23)))
        d.addWater(2000,now)
        assertFalse(d.applyReminderAction(r,"done",now))
        assertEquals(2000,d.total("2026-10-10"))
    }
    @Test fun waterRemindersAndSnoozesMustStillMatchTheCurrentSchedule() {
        val data = HealthData(settings = Settings(consent = true, waterEnabled = true, repeat = 10))
        val slots = Planner.plan(data, now.withHour(7), 1).filter { it.kind == "water" }
        val first = slots[0]
        val retry = slots[1]
        assertTrue(Planner.allowed(data, retry, now.plusMinutes(6)))
        data.settings = data.settings.copy(repeat = 15)
        assertFalse(data.applyReminderAction(retry, "done", now.plusMinutes(6)))

        assertTrue(data.applyReminderAction(first, "snooze", now))
        data.settings = data.settings.copy(start = "08:10")
        assertTrue(Planner.plan(data, now, 1).none { it.waterBase == first.waterBase })
        assertFalse(data.applyReminderAction(first.copy(at = data.waterSnoozes.getValue(first.waterBase)), "done", now.plusMinutes(11)))
        assertTrue(data.water.isEmpty())
    }
    @Test fun appointmentPresentationConvertsClinicDateAcrossMidnight() {
        val a=Appointment(title="Visit",wall="2026-10-10T00:30",zone="Asia/Tehran")
        assertEquals(LocalDateTime.parse("2026-10-09T17:00"),a.displayTime(ZoneId.of("America/New_York")))
        assertEquals(LocalDateTime.parse(a.wall),a.displayTime(ZoneId.of(a.zone)))
    }
}
