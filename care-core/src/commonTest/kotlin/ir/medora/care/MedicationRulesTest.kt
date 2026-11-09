package ir.medora.care

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class MedicationRulesTest {
    @Test fun phasedScheduleStartsItsOwnWeekAndChangesAmount() {
        val half = DoseSlot(480, 500)
        val whole = DoseSlot(480, 1000)
        val phases = listOf(
            MedicationPhase(4, 11, 1, 0b0001001, listOf(half)),
            MedicationPhase(11, 18, 1, 1, listOf(whole)),
            MedicationPhase(18, null, 2, 1, listOf(whole))
        )
        validatePhases(phases)
        assertEquals(listOf(half), slotsForDay(phases, 4))
        assertEquals(listOf(half), slotsForDay(phases, 7))
        assertEquals(listOf(whole), slotsForDay(phases, 11))
        assertEquals(listOf(whole), slotsForDay(phases, 18))
        assertTrue(slotsForDay(phases, 25).isEmpty())
        assertEquals(listOf(whole), slotsForDay(phases, 32))
        assertFailsWith<IllegalArgumentException> { validatePhases(phases + phases.first()) }
    }

    @Test fun stockSupportsFractionalDosesAndReversal() {
        assertEquals(500, parseQuantity("۰٫۵"))
        assertEquals("0.5", formatQuantity(500))
        assertEquals(4500, stockBalance(5000, 0, 500))
        assertEquals(4500, stockBalance(4500, 500, 500))
        assertEquals(5000, stockBalance(4500, 500, 0))
        assertEquals(12500, stockBalance(4500, 0, 0, 8000))
        assertTrue(stockIsLow(500, 0, 1000))
    }
}
