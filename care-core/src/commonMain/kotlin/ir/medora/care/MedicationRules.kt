package ir.medora.care

const val MAX_QUANTITY = 1_000_000_000

data class DoseSlot(val minuteOfDay: Int, val milliUnits: Int?)

data class MedicationPhase(
    val startDay: Int,
    val endBeforeDay: Int?,
    val intervalWeeks: Int,
    val weekdayMask: Int,
    val slots: List<DoseSlot>
) {
    fun occurs(day: Int): Boolean {
        if (day < startDay || (endBeforeDay != null && day >= endBeforeDay)) return false
        val weekday = ((day.toLong() + 3) % 7 + 7).toInt() % 7
        val week = (day.toLong() - startDay) / 7
        return week % intervalWeeks == 0L && weekdayMask and (1 shl weekday) != 0
    }
}

fun validatePhases(phases: List<MedicationPhase>) {
    require(phases.isNotEmpty() && phases.size <= 50)
    phases.forEachIndexed { index, phase ->
        require(phase.intervalWeeks in 1..52 && phase.weekdayMask in 1..127)
        require(phase.endBeforeDay == null || phase.endBeforeDay > phase.startDay)
        val next = phases.getOrNull(index + 1)
        require(next == null || (phase.endBeforeDay != null && phase.endBeforeDay <= next.startDay))
        require(phase.slots.size in 1..12 && phase.slots.zipWithNext().all { (a, b) -> a.minuteOfDay < b.minuteOfDay })
        require(phase.slots.all { it.minuteOfDay in 0..1439 && (it.milliUnits == null || it.milliUnits in 1..MAX_QUANTITY) })
    }
}

fun slotsForDay(phases: List<MedicationPhase>, day: Int): List<DoseSlot> =
    phases.firstOrNull { it.occurs(day) }?.slots.orEmpty()

fun nextPhaseDay(phase: MedicationPhase, fromDay: Int): Int? {
    val first = maxOf(phase.startDay, fromDay)
    val offset = first.toLong() - phase.startDay
    val period = 7 * phase.intervalWeeks
    val position = (offset % period).toInt()
    val nextPeriod = first.toLong() + period - position
    val days = sequence {
        if (position < 7) yieldAll(first.toLong() until first.toLong() + 7 - position)
        yieldAll(nextPeriod until nextPeriod + 7)
    }
    return days.firstOrNull { it <= Int.MAX_VALUE && phase.occurs(it.toInt()) }?.toInt()
}

/** Quantities are exact thousandths of one unit, including half or quarter tablets. */
fun stockBalance(balance: Int, previousDebit: Int, newDebit: Int, added: Int = 0): Int {
    require(previousDebit in 0..MAX_QUANTITY && newDebit in 0..MAX_QUANTITY && added in 0..MAX_QUANTITY)
    val result = balance.toLong() + previousDebit - newDebit + added
    require(result in -MAX_QUANTITY.toLong()..MAX_QUANTITY.toLong())
    return result.toInt()
}

fun stockIsLow(balance: Int, threshold: Int, nextAmount: Int = 0): Boolean =
    balance <= threshold || balance < nextAmount

fun parseQuantity(text: String): Int? {
    val normalized = text.trim().map {
        when (it) {
            in '۰'..'۹' -> '0' + (it - '۰')
            in '٠'..'٩' -> '0' + (it - '٠')
            '٫' -> '.'
            else -> it
        }
    }.joinToString("")
    if (!normalized.matches(Regex("[0-9]{1,7}(\\.[0-9]{1,3})?"))) return null
    val whole = normalized.substringBefore('.').toLong()
    val fraction = normalized.substringAfter('.', "").padEnd(3, '0').toInt()
    return (whole * 1000 + fraction).takeIf { it <= MAX_QUANTITY }?.toInt()
}

fun formatQuantity(milliUnits: Int): String {
    val amount = kotlin.math.abs(milliUnits.toLong())
    val sign = if (milliUnits < 0) "-" else ""
    val fractional = (amount % 1000).toString().padStart(3, '0').trimEnd('0')
    return sign + (amount / 1000) + if (fractional.isEmpty()) "" else ".$fractional"
}
