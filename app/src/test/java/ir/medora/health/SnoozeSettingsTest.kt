package ir.medora.health

import java.time.*
import org.junit.Assert.*
import org.junit.Test

class SnoozeSettingsTest {
    @Test fun medicationSnoozeUsesPersistedPresetAndCustomDuration() {
        listOf(10,30,60,45,1,1440).forEach { minutes ->
            val now=ZonedDateTime.parse("2026-10-11T08:00:00Z")
            val med=Medication(name="Medicine",startDay="2026-10-11",times=listOf("08:00"))
            val data=HealthData(settings=Settings(consent=true,medicationSnoozeMinutes=minutes),medications=mutableListOf(med))
            val dose=Dose.of(med,now.toLocalDate(),"08:00")
            data.doses+=dose;data.mark(dose,DoseStatus.SNOOZED,now.toInstant(),now.zone)
            val restored=Codec.decode(Codec.encode(data))
            assertEquals(minutes,restored.settings.medicationSnoozeMinutes)
            val expected=now.toInstant().plusSeconds(minutes*60L).toEpochMilli()
            assertEquals(expected,restored.doses.single().snoozeUntil)
            assertEquals(expected,Planner.plan(restored,now).single { it.kind=="dose" && it.reference==dose.id }.at)
        }
    }
    @Test fun snoozingEarlyPostponesTheScheduledTimeAndRepairsLegacySnoozes() {
        val now = ZonedDateTime.parse("2026-10-11T08:00:00+03:30[Asia/Tehran]")
        val medication = Medication(name = "Medicine", startDay = "2026-10-11", times = listOf("20:00"))
        val data = HealthData(settings = Settings(consent = true), medications = mutableListOf(medication))
        data.materialize(now)
        val dose = data.doses.single()
        val dueAt = now.withHour(20).toInstant().toEpochMilli()
        data.mark(dose, DoseStatus.SNOOZED, now.toInstant(), now.zone)
        assertEquals(dueAt + 600_000, Planner.plan(data, now).first { it.reference == dose.id }.at)

        data.doses[0] = data.doses.single().copy(snoozeUntil = now.toInstant().plusSeconds(600).toEpochMilli())
        val reopened = Codec.decode(Codec.encode(data))
        val reminder = Planner.plan(reopened, now).first { it.reference == dose.id }
        assertEquals(dueAt, reminder.at)
        assertFalse(Planner.allowed(reopened, reminder.copy(at = reopened.doses.single().snoozeUntil), now))
    }
    @Test fun legacySettingsDefaultToTenMinutes() {
        val json=org.json.JSONObject(Codec.encode(HealthData()))
        json.put("schema",6);json.getJSONObject("settings").remove("medicationSnoozeMinutes")
        assertEquals(10,Codec.decode(json.toString()).settings.medicationSnoozeMinutes)
    }
    @Test fun invalidCustomDurationIsRejected() {
        listOf(0,-1,1441).forEach { minutes ->
            assertThrows(IllegalArgumentException::class.java) { HealthData(settings=Settings(medicationSnoozeMinutes=minutes)).validate() }
        }
    }
}
