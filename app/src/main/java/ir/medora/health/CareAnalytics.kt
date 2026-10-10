package ir.medora.health

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZonedDateTime

/** Read-only projections: opening the calendar must not persist future dose records. */
fun HealthData.calendarDoses(day: LocalDate, now: ZonedDateTime = ZonedDateTime.now()): List<Dose> {
    val stored = dayDoses(day.toString())
    if (!day.isAfter(now.toLocalDate())) return stored
    val result = stored.associateBy { it.id }.toMutableMap()
    medications.filter { it.occurs(day) }.forEach { medication ->
        medication.times.forEach { time ->
            val dose = Dose.of(medication, day, time)
            val at = LocalDateTime.parse(dose.wall).atZone(now.zone).toInstant().toEpochMilli()
            if (at >= medication.effectiveFrom) result.putIfAbsent(dose.id, dose)
        }
    }
    return result.values.sortedBy { it.wall }
}

data class CareReport(
    val start: LocalDate,
    val end: LocalDate,
    val waterByDay: List<Pair<LocalDate, Int>>,
    val taken: Int,
    val skipped: Int,
    val unmarked: Int
) {
    val totalWater: Long get() = waterByDay.sumOf { it.second.toLong() }
    val averageWater: Long get() = if (waterByDay.isEmpty()) 0 else totalWater / waterByDay.size
    val totalDoses: Int get() = taken + skipped + unmarked
}

/** Future scheduled doses do not reduce historical adherence. Pending is never skipped. */
fun HealthData.careReport(start: LocalDate, end: LocalDate, now: ZonedDateTime = ZonedDateTime.now()): CareReport {
    require(!start.isAfter(end))
    val last = minOf(end, now.toLocalDate())
    val totals = water.groupBy { it.day }.mapValues { (_, entries) -> entries.sumOf { it.ml } }
    val days = mutableListOf<Pair<LocalDate, Int>>()
    var day = start
    while (!day.isAfter(last)) {
        days += day to (totals[day.toString()] ?: 0)
        day = day.plusDays(1)
    }
    val eligible = doses.filter { dose ->
        val wall = LocalDateTime.parse(dose.wall)
        val date = wall.toLocalDate()
        !date.isBefore(start) && !date.isAfter(last) &&
            (!wall.atZone(now.zone).toInstant().isAfter(now.toInstant()) || dose.status == DoseStatus.TAKEN || dose.status == DoseStatus.SKIPPED)
    }
    return CareReport(start, last, days,
        eligible.count { it.status == DoseStatus.TAKEN },
        eligible.count { it.status == DoseStatus.SKIPPED },
        eligible.count { it.status == DoseStatus.PENDING || it.status == DoseStatus.SNOOZED })
}
