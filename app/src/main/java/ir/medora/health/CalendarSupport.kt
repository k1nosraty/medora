package ir.medora.health

import android.icu.text.SimpleDateFormat
import android.icu.util.Calendar
import android.icu.util.PersianCalendar
import android.icu.util.ULocale
import android.icu.util.TimeZone
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Date

/**
 * Calendar conversion and display helpers. Internal dates remain ISO/Gregorian
 * LocalDate values; ICU is used only at the presentation and input boundaries.
 */
object CalendarSupport {
    data class SolarDate(val year: Int, val month: Int, val day: Int)

    private val persianLocale = ULocale.forLanguageTag("fa-IR-u-ca-persian")
    private val utc = TimeZone.getTimeZone("UTC")

    fun solarDate(date: LocalDate): SolarDate {
        val calendar = PersianCalendar(utc, persianLocale).apply {
            timeInMillis = date.atTime(12, 0).toInstant(ZoneOffset.UTC).toEpochMilli()
        }
        return SolarDate(
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH) + 1,
            calendar.get(Calendar.DAY_OF_MONTH)
        )
    }

    fun toGregorian(year: Int, month: Int, day: Int): LocalDate {
        require(month in 1..12 && day in 1..31) { "date.invalid" }
        val calendar = PersianCalendar(utc, persianLocale).apply {
            clear()
            isLenient = false
            set(Calendar.EXTENDED_YEAR, year)
            set(Calendar.MONTH, month - 1)
            set(Calendar.DAY_OF_MONTH, day)
            set(Calendar.HOUR_OF_DAY, 12)
        }
        return Instant.ofEpochMilli(calendar.timeInMillis).atZone(ZoneOffset.UTC).toLocalDate()
    }

    fun fromInput(value: String, calendar: String): LocalDate {
        val parts = normalize(value.trim()).replace('-', '/').split('/')
        require(parts.size == 3) { "date.invalid" }
        val year = parts[0].toInt()
        val month = parts[1].toInt()
        val day = parts[2].toInt()
        return if (calendar == "jalali") toGregorian(year, month, day) else LocalDate.of(year, month, day)
    }

    fun inputDate(date: LocalDate, calendar: String, language: String): String {
        val fields = if (calendar == "jalali") solarDate(date).let { listOf(it.year, it.month, it.day) }
        else listOf(date.year, date.monthValue, date.dayOfMonth)
        val raw = fields.mapIndexed { index, value ->
            if (index == 0) value.toString() else value.toString().padStart(2, '0')
        }.joinToString(if (calendar == "jalali") "/" else "-")
        return localizedNumber(raw, language)
    }

    fun formatDate(date: LocalDate, calendar: String, language: String, includeWeekday: Boolean = false): String {
        val locale = locale(language, calendar)
        val pattern = when {
            includeWeekday && language == "en" -> "EEEE, MMM d, yyyy"
            includeWeekday -> "EEEE، d MMMM yyyy"
            language == "en" -> "MMM d, yyyy"
            else -> "d MMMM yyyy"
        }
        return formatter(pattern, locale).format(Date(date.atTime(12, 0).toInstant(ZoneOffset.UTC).toEpochMilli()))
            .let { localizedNumber(it, language) }
    }

    fun monthTitle(date: LocalDate, calendar: String, language: String): String =
        formatter("MMMM yyyy", locale(language, calendar))
            .format(Date(date.atTime(12, 0).toInstant(ZoneOffset.UTC).toEpochMilli()))
            .let { localizedNumber(it, language) }

    fun dayOfMonth(date: LocalDate, calendar: String): Int =
        if (calendar == "jalali") solarDate(date).day else date.dayOfMonth

    fun startOfMonth(date: LocalDate, calendar: String): LocalDate {
        if (calendar != "jalali") return date.withDayOfMonth(1)
        val solar = solarDate(date)
        return toGregorian(solar.year, solar.month, 1)
    }

    fun plusMonths(date: LocalDate, amount: Int, calendar: String): LocalDate {
        if (calendar != "jalali") return date.plusMonths(amount.toLong())
        val solar = solarDate(date)
        val absoluteMonth = solar.year.toLong() * 12 + solar.month - 1 + amount
        val year = Math.floorDiv(absoluteMonth, 12L).toInt()
        val month = Math.floorMod(absoluteMonth, 12L).toInt() + 1
        return toGregorian(year, month, 1)
    }

    fun monthLength(monthStart: LocalDate, calendar: String): Int =
        (plusMonths(monthStart, 1, calendar).toEpochDay() - monthStart.toEpochDay()).toInt()

    fun firstDayOfWeek(language: String): Int = if (language == "en") 1 else 6 // java.time: Mon=1 … Sun=7; fa starts Sat.

    fun weekdayOrder(language: String): List<Int> = if (language == "en") (1..7).toList() else listOf(6, 7, 1, 2, 3, 4, 5)

    fun shortWeekdays(language: String): List<String> = if (language == "en") {
        listOf("weekday.monShort", "weekday.tueShort", "weekday.wedShort", "weekday.thuShort", "weekday.friShort", "weekday.satShort", "weekday.sunShort")
    } else {
        listOf("weekday.satShort", "weekday.sunShort", "weekday.monShort", "weekday.tueShort", "weekday.wedShort", "weekday.thuShort", "weekday.friShort")
    }

    private fun locale(language: String, calendar: String): ULocale {
        val base = if (language == "en") "en-US" else "fa-IR"
        val calendarType = if (calendar == "jalali") "persian" else "gregory"
        return ULocale.forLanguageTag("$base-u-ca-$calendarType")
    }

    private fun formatter(pattern: String, locale: ULocale) = SimpleDateFormat(pattern, locale).apply {
        timeZone = utc
        isLenient = false
    }
}
