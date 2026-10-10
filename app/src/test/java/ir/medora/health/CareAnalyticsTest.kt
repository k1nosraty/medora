package ir.medora.health

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.*
import org.junit.Test

class CareAnalyticsTest {
    private val now = ZonedDateTime.of(2026, 10, 10, 12, 0, 0, 0, ZoneId.of("Asia/Tehran"))

    @Test fun pendingIsNotSkippedAndFutureDosesDoNotReduceAdherence() {
        val data = HealthData()
        data.doses += listOf(
            Dose("a", "m", "Medicine", "", "2026-10-10T08:00", DoseStatus.TAKEN),
            Dose("b", "m", "Medicine", "", "2026-10-10T09:00"),
            Dose("c", "m", "Medicine", "", "2026-10-10T10:00", DoseStatus.SKIPPED),
            Dose("d", "m", "Medicine", "", "2026-10-10T18:00"),
            Dose("e", "m", "Medicine", "", "2026-10-11T08:00"))
        val report = data.careReport(now.toLocalDate(), now.toLocalDate(), now)
        assertEquals(1, report.taken)
        assertEquals(1, report.skipped)
        assertEquals(1, report.unmarked)
        assertEquals(3, report.totalDoses)
    }

    @Test fun waterAverageIncludesUnloggedDaysButExcludesFutureDays() {
        val data = HealthData()
        data.water += Water(ml = 600, day = "2026-10-09", at = 0)
        data.water += Water(ml = 1000, day = "2026-10-11", at = 0)
        val report = data.careReport(LocalDate.of(2026, 10, 8), LocalDate.of(2026, 10, 12), now)
        assertEquals(3, report.waterByDay.size)
        assertEquals(600L, report.totalWater)
        assertEquals(200L, report.averageWater)
        assertEquals(now.toLocalDate(), report.end)
    }

    @Test fun calendarProjectionIsReadOnlyAndPreservesStoredDoseStatus() {
        val data = HealthData()
        val medication = Medication(id = "m", name = "Medicine", startDay = "2026-10-10", times = listOf("08:00", "18:00"))
        data.medications += medication
        val tomorrow = now.toLocalDate().plusDays(1)
        val taken = Dose.of(medication, tomorrow, "08:00").copy(status = DoseStatus.TAKEN)
        data.doses += taken
        val projected = data.calendarDoses(tomorrow, now)
        assertEquals(2, projected.size)
        assertEquals(taken, projected.first())
        assertEquals(listOf(taken), data.doses)
        assertEquals("", data.through)
    }

    @Test fun futureProjectionRespectsPausedSchedulesAndEffectiveTime() {
        val data = HealthData()
        data.medications += Medication(id = "paused", name = "Paused", startDay = "2026-10-10", times = listOf("08:00"), active = false)
        data.medications += Medication(id = "later", name = "Later", startDay = "2026-10-10", times = listOf("08:00", "18:00"),
            effectiveFrom = now.plusDays(1).withHour(12).toInstant().toEpochMilli())
        val projected = data.calendarDoses(now.toLocalDate().plusDays(1), now)
        assertEquals(1, projected.size)
        assertEquals("2026-10-11T18:00", projected.single().wall)
    }

    @Test fun aFutureOnlyReportContainsNoFabricatedData() {
        val data = HealthData()
        val report = data.careReport(now.toLocalDate().plusDays(1), now.toLocalDate().plusDays(3), now)
        assertTrue(report.waterByDay.isEmpty())
        assertEquals(0L, report.averageWater)
        assertEquals(0, report.totalDoses)
    }
}
