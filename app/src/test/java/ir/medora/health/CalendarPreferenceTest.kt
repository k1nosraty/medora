package ir.medora.health

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZonedDateTime
import java.time.ZoneId

class CalendarPreferenceTest {
    @Test
    fun newInstallDefaultsToPersianAndSolarHijri() {
        assertEquals("fa", Settings().language)
        assertEquals("jalali", Settings().calendar)
    }

    @Test
    fun languageAndCalendarPreferencesRoundTripWithoutMovingReminders() {
        val now = ZonedDateTime.of(2026, 10, 10, 7, 0, 0, 0, ZoneId.of("Asia/Tehran"))
        val medication = Medication(
            id = "daily-med",
            name = "Medication",
            startDay = "2026-10-10",
            times = listOf("08:00", "20:00")
        )
        val appointment = Appointment(
            id = "visit",
            title = "Clinic visit",
            wall = "2026-10-11T14:30",
            zone = "Asia/Tehran",
            offsets = setOf(60)
        )
        val original = HealthData(
            settings = Settings(consent = true),
            medications = mutableListOf(medication),
            appointments = mutableListOf(appointment)
        )
        val originalMoments = Planner.plan(original, now).map { it.key to it.at }

        val changedPreferences = original.copy(settings = original.settings.copy(language = "en", calendar = "gregorian"))
        val restored = Codec.decode(Codec.encode(changedPreferences))
        val restoredMoments = Planner.plan(restored, now).map { it.key to it.at }

        assertEquals("en", restored.settings.language)
        assertEquals("gregorian", restored.settings.calendar)
        assertEquals(originalMoments, restoredMoments)
        assertEquals(medication.startDay, restored.medications.single().startDay)
        assertEquals(medication.times, restored.medications.single().times)
        assertEquals(appointment.instant(), restored.appointments.single().instant())
    }

    @Test
    fun schemaThreeMigrationAddsDisplayPreferencesWithoutChangingRecords() {
        val original = HealthData(
            settings = Settings(consent = true),
            medications = mutableListOf(Medication(id = "med", name = "Tablet", startDay = "2026-10-10", times = listOf("09:00")))
        )
        val legacy = JSONObject(Codec.encode(original)).apply {
            put("schema", 3)
            getJSONObject("settings").apply { remove("language"); remove("calendar") }
        }

        val migrated = Codec.decode(legacy.toString())
        assertEquals("fa", migrated.settings.language)
        assertEquals("jalali", migrated.settings.calendar)
        assertEquals(original.medications, migrated.medications)
    }

    @Test
    fun copyCatalogAndNumeralsFollowSelectedLanguage() {
        assertEquals("امروز", localizedText("nav.today", "fa"))
        assertEquals("Today", localizedText("nav.today", "en"))
        assertEquals("۱۴۰۳/۰۱/۰۱", localizedNumber("1403/01/01", "fa"))
        assertEquals("1403/01/01", localizedNumber("1403/01/01", "en"))
        assertTrue(localizedText("settings.calendarNote", "en").contains("displayed"))
    }
}
