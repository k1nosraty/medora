package ir.medora.health

import ir.medora.care.DoseSlot
import ir.medora.care.MedicationPhase
import java.time.ZonedDateTime
import org.junit.Assert.*
import org.junit.Test

class MedicationPlanTest {
    private val now = ZonedDateTime.parse("2026-11-09T07:00+03:30[Asia/Tehran]")
    private val day = now.toLocalDate()
    private val start = day.toEpochDay().toInt()
    private val med = Medication(
        name = "Example", startDay = day.toString(), times = listOf("08:00"), unit = "tablet",
        phases = listOf(
            MedicationPhase(start, start + 7, 1, 9, listOf(DoseSlot(480, 500))),
            MedicationPhase(start + 7, start + 14, 1, 1, listOf(DoseSlot(540, 1000))),
            MedicationPhase(start + 14, null, 2, 1, listOf(DoseSlot(540, 1000)))
        ), stock = MedicationStock(1500, 500, now.toInstant().toEpochMilli())
    )

    @Test fun phasesDriveCalendarAlarmAndHistoryThroughEdits() {
        val data = HealthData(settings = Settings(consent = true), medications = mutableListOf(med))
        data.materialize(now)
        val first = data.doses.single()
        assertEquals(500, first.milliUnits)
        assertEquals(1000, data.calendarDoses(day.plusDays(7), now).single().milliUnits)
        assertTrue(data.calendarDoses(day.plusDays(21), now).isEmpty())
        assertEquals(3, Planner.plan(data, now).count { it.kind == "dose" })

        val atDose = now.plusHours(1)
        data.mark(first, DoseStatus.TAKEN, atDose.toInstant(), now.zone)
        data.changeMedication(med.copy(phases = med.phases.drop(1)), atDose.plusMinutes(1))
        val restored = Codec.decode(Codec.encode(data))
        assertEquals(500, restored.doses.single().actualMilliUnits)
        assertEquals(med.phases.drop(1), restored.medications.single().phases)
        assertEquals(1000, restored.medications.single().stock?.balance)
    }

    @Test fun aFractionalDoseDebitsOnceAndCanBeCorrectedOrUndone() {
        val data = HealthData(settings = Settings(consent = true), medications = mutableListOf(med))
        data.materialize(now)
        val dose = data.doses.single()
        val due = now.plusHours(1)
        val notification = Planner.plan(data, now).first { it.kind == "dose" }
        assertTrue(data.applyReminderAction(notification, "done", due))
        data.mark(dose, DoseStatus.TAKEN, due.toInstant(), due.zone)
        assertEquals(1000, data.medications.single().stock?.balance)
        data.mark(dose, DoseStatus.TAKEN, due.toInstant(), due.zone, actualAmount = 1250)
        assertEquals(250, data.medications.single().stock?.balance)
        assertTrue(data.lowStock(data.medications.single(), due))
        data.mark(dose, DoseStatus.SKIPPED, due.toInstant(), due.zone)
        assertEquals(1500, data.medications.single().stock?.balance)
        data.addStock(med.id, 3000)
        assertEquals(4500, data.medications.single().stock?.balance)
        assertFalse(data.lowStock(data.medications.single(), due))
    }
}
