package ir.medora.health

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CalendarSupportTest {
    @Test
    fun solarYearBoundaryAndLeapMonthConvertBothWays() {
        val newYear1403 = LocalDate.of(2024, 3, 20)
        assertEquals(CalendarSupport.SolarDate(1403, 1, 1), CalendarSupport.solarDate(newYear1403))
        assertEquals(newYear1403, CalendarSupport.toGregorian(1403, 1, 1))
        assertEquals(LocalDate.of(2025, 3, 20), CalendarSupport.toGregorian(1403, 12, 30))
        assertEquals(CalendarSupport.SolarDate(1403, 12, 30), CalendarSupport.solarDate(LocalDate.of(2025, 3, 20)))
        assertEquals(LocalDate.of(2025, 3, 21), CalendarSupport.toGregorian(1404, 1, 1))
    }

    @Test
    fun displayInputAndMonthNavigationRespectSelectedCalendar() {
        val gregorian = LocalDate.of(2024, 3, 20)
        assertEquals(gregorian, CalendarSupport.fromInput("۱۴۰۳/۰۱/۰۱", "jalali"))
        assertEquals(gregorian, CalendarSupport.fromInput("2024-03-20", "gregorian"))
        assertEquals(30, CalendarSupport.monthLength(CalendarSupport.toGregorian(1403, 12, 1), "jalali"))
        assertEquals(CalendarSupport.toGregorian(1404, 1, 1),
            CalendarSupport.plusMonths(CalendarSupport.toGregorian(1403, 12, 1), 1, "jalali"))
        assertTrue(CalendarSupport.formatDate(gregorian, "jalali", "en").contains("1403"))
    }
}
