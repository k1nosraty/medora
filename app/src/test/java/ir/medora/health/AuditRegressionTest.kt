package ir.medora.health

import java.time.*
import java.util.concurrent.Executor
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AuditRegressionTest {
    private val zone=ZoneId.of("Asia/Tehran")
    private val before=ZonedDateTime.of(2026,10,10,7,59,0,0,zone)
    private fun medication(times:List<String> = listOf("08:00","08:05"))=
        Medication(id="med",name="User medicine",startDay="2026-10-10",times=times)
    private fun data(m:Medication=medication())=HealthData(
        settings=Settings(consent=true),medications=mutableListOf(m),reminderCheckpoint=before.toInstant().toEpochMilli()
    ).apply { materialize(before) }

    @Test fun delayedDeliveryRecoversAllInterveningDoses() {
        val d=data();val now=before.withHour(8).withMinute(15)
        assertEquals(listOf("08:00","08:05"),Planner.overdue(d,now).map { it.reference.substringAfterLast('|') })
    }
    @Test fun persistedDeliveryLedgerPreventsRepostingAfterRestart() {
        val d=data();val now=before.withHour(8).withMinute(15)
        val due=Planner.overdue(d,now)
        due.forEach { d.deliveredReminders[it.key]=it.at }
        val reopened=Codec.decode(Codec.encode(d))
        assertTrue(Planner.overdue(reopened,now).isEmpty())
        assertEquals(d.reminderCheckpoint,reopened.reminderCheckpoint)
    }
    @Test fun legacyQueueRecoversLaterSlotsWithoutNewCheckpoint() {
        val d=data().apply { reminderCheckpoint=0 }
        val first=Planner.plan(d,before).first().at
        assertEquals(2,Planner.overdue(d,before.withHour(8).withMinute(15),first).size)
    }
    @Test fun recoveringAfterMidnightKeepsDeferredDose() {
        val late=before.withHour(23).withMinute(55)
        val d=data(medication(listOf("23:55")))
        d.mark(d.dayDoses("2026-10-10").single(),DoseStatus.SNOOZED,late.toInstant())
        d.reminderCheckpoint=late.toInstant().toEpochMilli()
        assertEquals(1,Planner.overdue(d,late.plusMinutes(15)).size)
    }
    @Test fun expiredWaterIsNotSentOutsideWindowOrOnAnotherDay() {
        val d=data().apply { settings=settings.copy(waterEnabled=true,repeat=10) }
        val afterEnd=before.withHour(22).withMinute(1)
        assertTrue(Planner.overdue(d,afterEnd).none { it.kind=="water" })
        val tomorrow=before.plusDays(1).withHour(8).withMinute(1)
        assertTrue(Planner.overdue(d,tomorrow).filter{it.kind=="water"}.all{
            it.waterBase.contains(tomorrow.toLocalDate().toString())
        })
    }
    @Test fun windowEndIsExclusiveAndLastInsideSlotToleratesMilliseconds() {
        val d=HealthData(settings=Settings(consent=true,waterEnabled=true))
        val slots=Planner.plan(d,before,1).filter{it.kind=="water"}
        val end=before.withHour(22).withMinute(0)
        assertTrue(slots.all { it.at<end.toInstant().toEpochMilli() })
        val last=slots.last();val actual=Instant.ofEpochMilli(last.at+1).atZone(zone)
        assertTrue(Planner.allowed(d,last,actual))
        assertFalse(Planner.allowed(d,last,end))
    }
    @Test fun editingAtNoonDoesNotInventPastDose() {
        val d=data(medication(listOf("08:00")))
        d.changeMedication(medication(listOf("09:00","14:00")),before.withHour(12))
        assertEquals(listOf("08:00","14:00"),d.dayDoses("2026-10-10").map{it.wall.substring(11)})
        assertTrue(Planner.overdue(d,before.withHour(12).withMinute(1)).none{it.reference.endsWith("|09:00")})
    }
    @Test fun editingBeforeNextSlotUpdatesFuturePlanAndKeepsHistory() {
        val d=data(medication(listOf("08:00","20:00")))
        val consumed=d.dayDoses("2026-10-10").first()
        d.mark(consumed,DoseStatus.TAKEN,before.withHour(8).toInstant())
        d.changeMedication(medication(listOf("09:00","21:00")),before.withHour(12))
        assertEquals(DoseStatus.TAKEN,d.dayDoses("2026-10-10").first().status)
        assertEquals(listOf("08:00","21:00"),d.dayDoses("2026-10-10").map{it.wall.substring(11)})
        d.materialize(before.plusDays(1))
        assertEquals(listOf("09:00","21:00"),d.dayDoses("2026-10-11").map{it.wall.substring(11)})
    }
    @Test fun newMedicineNeverRetroactivelyNotifiesPastSlot() {
        val d=HealthData(settings=Settings(consent=true),reminderCheckpoint=before.toInstant().toEpochMilli())
        d.changeMedication(medication(listOf("08:00","14:00")),before.withHour(12))
        assertEquals(listOf("14:00"),d.dayDoses("2026-10-10").map{it.wall.substring(11)})
        assertTrue(Planner.overdue(d,before.withHour(12).withMinute(1)).isEmpty())
    }
    @Test fun unchangedDeferredSlotSurvivesPlanEdit() {
        val d=data(medication(listOf("08:00")))
        val snoozeAt=before.withHour(8).withMinute(1)
        d.mark(d.dayDoses("2026-10-10").single(),DoseStatus.SNOOZED,snoozeAt.toInstant())
        d.changeMedication(medication(listOf("08:00","14:00")),snoozeAt.plusMinutes(1))
        assertEquals(1,Planner.overdue(d,snoozeAt.plusMinutes(11)).size)
    }
    @Test fun schemaTwoPreservesExplicitPrivacyBothWays() {
        for(privateMode in listOf(true,false)) {
            val json=JSONObject(Codec.encode(data().apply { settings=settings.copy(privateNotifications=privateMode) }))
            json.put("schema",2)
            json.remove("reminderCheckpoint");json.remove("deliveredReminders")
            val restored=Codec.decode(json.toString())
            assertEquals(privateMode,restored.settings.privateNotifications)
            assertEquals(0L,restored.reminderCheckpoint)
        }
    }
    @Test fun amountEditAfterTravelPreservesOriginalDayAndInstant() {
        val logged=before.withHour(0).withMinute(30).withSecond(17)
        val w=Water(ml=250,day=logged.toLocalDate().toString(),at=logged.toInstant().toEpochMilli())
        val london=ZoneId.of("Europe/London")
        val updated=w.edited(500,w.editTime(london),london)
        assertEquals(w.day,updated.day);assertEquals(w.at,updated.at);assertEquals(500,updated.ml)
        val d=HealthData(water=mutableListOf(updated))
        assertEquals(500,d.total("2026-10-10"));assertEquals(0,d.total("2026-10-09"))
    }
    @Test fun explicitlyChangingWaterDateStillMovesTheRecord() {
        val w=Water(ml=250,day="2026-10-10",at=before.toInstant().toEpochMilli())
        val changed=w.edited(300,w.editTime(zone).minusDays(1),zone)
        assertEquals("2026-10-09",changed.day)
        assertNotEquals(w.at,changed.at)
    }
    @Test fun rapidClicksAndPermissionUpdateAreAllQueued() {
        val tasks=ArrayDeque<Runnable>();val callbacks=ArrayDeque<()->Unit>()
        val queue=SerialWorkQueue(Executor { tasks.add(it) }) { callbacks.add(it) }
        val d=HealthData();var completed=0
        queue.submit({d.addWater(250,before)}) { assertTrue(it.isSuccess);completed++ }
        queue.submit({d.addWater(250,before)}) { assertTrue(it.isSuccess);completed++ }
        queue.submit({d.settings=d.settings.copy(consent=true)}) { assertTrue(it.isSuccess);completed++ }
        assertEquals(3,queue.pending)
        while(tasks.isNotEmpty())tasks.removeFirst().run()
        while(callbacks.isNotEmpty())callbacks.removeFirst().invoke()
        assertEquals(500,d.total("2026-10-10"));assertTrue(d.settings.consent)
        assertEquals(3,completed);assertEquals(0,queue.pending)
    }
    @Test fun failedSaveDoesNotDiscardFollowingChange() {
        val tasks=ArrayDeque<Runnable>();val callbacks=ArrayDeque<()->Unit>()
        val queue=SerialWorkQueue(Executor { tasks.add(it) }) { callbacks.add(it) }
        var successful=0;var failed=0
        queue.submit({error("storage error")}) { if(it.isFailure)failed++ }
        queue.submit({42}) { if(it.getOrNull()==42)successful++ }
        while(tasks.isNotEmpty())tasks.removeFirst().run()
        while(callbacks.isNotEmpty())callbacks.removeFirst().invoke()
        assertEquals(1,failed);assertEquals(1,successful);assertEquals(0,queue.pending)
    }
    @Test fun revokedConsentDoesNotRecoverOldReminders() {
        val d=data().apply { settings=settings.copy(consent=false) }
        assertTrue(Planner.overdue(d,before.withHour(8).withMinute(15)).isEmpty())
    }
    @Test fun privacyRefreshContentHasCurrentLanguageAndDetails() {
        val d=data();val r=Planner.plan(d,before).first { it.kind=="dose" }
        val english=Planner.content(d.copy(settings=d.settings.copy(language="en")),r.copy(title="",body=""))
        assertTrue(english.title.contains("User medicine"));assertTrue(english.body.contains("08:00"))
        assertEquals(r.key,english.key);assertEquals(r.reference,english.reference)
    }
}
