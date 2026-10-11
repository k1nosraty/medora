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
            data.doses+=dose;data.mark(dose,DoseStatus.SNOOZED,now.toInstant())
            val restored=Codec.decode(Codec.encode(data))
            assertEquals(minutes,restored.settings.medicationSnoozeMinutes)
            val expected=now.toInstant().plusSeconds(minutes*60L).toEpochMilli()
            assertEquals(expected,restored.doses.single().snoozeUntil)
            assertEquals(expected,Planner.plan(restored,now).single { it.kind=="dose" && it.reference==dose.id }.at)
        }
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
