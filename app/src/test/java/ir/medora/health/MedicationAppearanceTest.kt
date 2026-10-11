package ir.medora.health

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.time.LocalDate

class MedicationAppearanceTest {
    private fun data(icon:MedicationIcon=MedicationIcon.CAPSULE,color:MedicationColor=MedicationColor.ORANGE):HealthData {
        val medication=Medication(id="appearance",name="Vitamin D",startDay="2026-10-11",times=listOf("08:00"),icon=icon,color=color)
        return HealthData(medications=mutableListOf(medication),doses=mutableListOf(Dose.of(medication,LocalDate.parse("2026-10-11"),"08:00")))
    }
    @Test fun allAppearanceChoicesSurvivePersistenceAndDoseSnapshot() {
        MedicationIcon.entries.forEach { icon -> MedicationColor.entries.forEach { color ->
            val decoded=Codec.decode(Codec.encode(data(icon,color)))
            assertEquals(icon,decoded.medications.single().icon);assertEquals(color,decoded.medications.single().color)
            assertEquals(icon,decoded.doses.single().icon);assertEquals(color,decoded.doses.single().color)
            decoded.medications.clear()
            val history=Codec.decode(Codec.encode(decoded)).doses.single()
            assertEquals(icon,history.icon);assertEquals(color,history.color)
        } }
    }
    @Test fun legacyAndUnknownAppearanceValuesFallBackWithoutLosingMedication() {
        val json=JSONObject(Codec.encode(data()))
        json.put("schema",5)
        listOf("medications","doses").forEach { key -> json.getJSONArray(key).getJSONObject(0).apply { remove("icon");remove("color") } }
        val legacy=Codec.decode(json.toString())
        assertEquals(MedicationIcon.CAPSULE,legacy.medications.single().icon)
        assertEquals(MedicationColor.ORANGE,legacy.doses.single().color)
        json.getJSONArray("medications").getJSONObject(0).put("icon","UNKNOWN").put("color","UNKNOWN")
        assertEquals("Vitamin D",Codec.decode(json.toString()).medications.single().name)
    }
}
