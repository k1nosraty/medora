@file:OptIn(ExperimentalJsExport::class)

package ir.medora.care

import kotlin.js.ExperimentalJsExport
import kotlin.js.JsExport

@JsExport
class WebSlot(val minuteOfDay: Int, val milliUnits: Int?) {
    internal fun toSlot() = DoseSlot(minuteOfDay, milliUnits)
}

@JsExport
class WebPhase(
    val startDay: Int,
    val endBeforeDay: Int?,
    val intervalWeeks: Int,
    val weekdayMask: Int,
    val slots: Array<WebSlot>
) {
    internal fun toPhase() = MedicationPhase(startDay, endBeforeDay, intervalWeeks, weekdayMask, slots.map { it.toSlot() })
}

@JsExport
fun validMedicationPhases(phases: Array<WebPhase>): Boolean =
    runCatching { validatePhases(phases.map { it.toPhase() }) }.isSuccess

@JsExport
fun medicationSlots(phases: Array<WebPhase>, day: Int): Array<WebSlot> =
    slotsForDay(phases.map { it.toPhase() }, day).map { WebSlot(it.minuteOfDay, it.milliUnits) }.toTypedArray()

@JsExport
fun nextMedicationPhaseDay(phase: WebPhase, day: Int): Int? = nextPhaseDay(phase.toPhase(), day)

@JsExport
fun updateStock(balance: Int, previousDebit: Int, newDebit: Int, added: Int): Int =
    stockBalance(balance, previousDebit, newDebit, added)

@JsExport
fun isLowStock(balance: Int, threshold: Int, nextAmount: Int): Boolean = stockIsLow(balance, threshold, nextAmount)

@JsExport
fun quantityFromText(text: String): Int? = parseQuantity(text)

@JsExport
fun quantityToText(amount: Int): String = formatQuantity(amount)
