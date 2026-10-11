package ir.medora.health

import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.unit.dp
import android.app.Application
import androidx.compose.ui.graphics.asAndroidBitmap
import android.graphics.Bitmap
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.time.LocalDate
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Runs real production Compose screens and saves device screenshots for visual review. */
@RunWith(AndroidJUnit4::class)
class WellnessUiTest {
    @get:Rule val compose = createComposeRule()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val application get() = instrumentation.targetContext.applicationContext as Application
    private lateinit var model: HealthViewModel

    @Test fun medicationAppearanceCanBeSelectedAndPersisted() {
        launch(compact=true)
        compose.onNodeWithTag("nav-2").performClick()
        compose.onNodeWithText(localizedText("medication.new","fa")).performClick()
        compose.onNodeWithTag("appearance-toggle").performScrollTo().performClick()
        MedicationIcon.entries.forEach { option ->
            compose.onNodeWithTag("appearance-icon-${option.name}").performScrollTo().performClick().assertIsSelected()
        }
        compose.onNodeWithTag("appearance-icon-DROPS").performScrollTo().performClick()
        compose.onNodeWithTag("appearance-color-LAVENDER").performScrollTo().performClick().assertIsSelected()
        compose.onNodeWithText(localizedText("medication.name","fa"),substring=true).performTextInput("Appearance test")
        capture("appearance-editor")
        compose.onNodeWithText(localizedText("common.save","fa")).performScrollTo().assertIsDisplayed().performClick()
        compose.waitUntil(15000) { model.data?.medications?.any { it.name=="Appearance test" }==true && !model.busy }
        val saved=Repository.executor.submit<HealthData> { Repository.get(application).read() }.get().medications.first { it.name=="Appearance test" }
        assertEquals(MedicationIcon.DROPS,saved.icon)
        assertEquals(MedicationColor.LAVENDER,saved.color)
    }

    @Test fun futureTodayScheduleIsVisibleWithoutDoseActions() {
        launch(compact=true)
        compose.onNodeWithTag("day-next").performScrollTo().assertIsEnabled().performClick()
        compose.onNodeWithText(localizedText("schedule.futureReadOnly","fa")).assertExists()
        compose.onAllNodesWithText("قرص آهن").onFirst().performScrollTo().assertIsDisplayed()
        compose.onNodeWithContentDescription(localizedText("a11y.changeDoseStatus","fa")).assertDoesNotExist()
        compose.onNodeWithText("ویزیت متخصص قلب").performScrollTo().assertIsDisplayed()
        capture("future-today")
    }

    @Test fun customMedicationSnoozePersistsFromSettings() {
        launch(compact=true)
        compose.onNodeWithTag("settings").performClick()
        compose.onNodeWithText(localizedText("settings.medicationsTab","fa")).performClick()
        listOf(10,30,60).forEach { minutes ->
            compose.onNodeWithText(localizedText("settings.minutes","fa",localizedNumber(minutes.toString(),"fa"))).performScrollTo().performClick().assertIsSelected()
        }
        compose.onNodeWithText(localizedText("settings.customSnooze","fa")).performScrollTo().performClick()
        compose.onNodeWithText(localizedText("settings.snoozeMinutes","fa")).performScrollTo().performTextReplacement("45")
        capture("snooze-settings")
        compose.onNodeWithText(localizedText("common.saveSettings","fa")).performClick()
        compose.waitUntil(15000) { model.data?.settings?.medicationSnoozeMinutes==45 && !model.busy }
        val saved=Repository.executor.submit<HealthData> { Repository.get(application).read() }.get()
        assertEquals(45,saved.settings.medicationSnoozeMinutes)
    }

    @Before fun seedOnlyTestData() {
        val today = LocalDate.now()
        val medication = Medication(id = "ui-med", name = "قرص آهن", instructions = "۱۵۰ میلی‌گرم", startDay = today.toString(), times = listOf("08:00", "17:00"))
        val data = HealthData()
        data.medications += medication
        data.doses += Dose.of(medication, today, "08:00").copy(status = DoseStatus.TAKEN)
        data.doses += Dose.of(medication, today, "17:00")
        data.appointments += Appointment(id = "ui-visit", title = "ویزیت متخصص قلب", wall = today.plusDays(1).atTime(10, 0).toString(),
            zone = ZonedDateTime.now().zone.id, location = "کلینیک سلامت، طبقه ۲")
        (0L..6L).forEach { offset ->
            data.addWater(if (offset == 0L) 1200 else (offset.toInt() + 2) * 150,
                today.minusDays(offset).atTime(9, 0).atZone(ZonedDateTime.now().zone))
        }
        Repository.executor.submit { Repository.get(application).save(data) }.get()
        instrumentation.runOnMainSync { model = HealthViewModel(application) }
    }

    private fun launch(dark: Boolean = false, language: String = "fa", compact: Boolean = false) {
        compose.waitUntil(15000) { model.data != null && !model.busy }
        instrumentation.runOnMainSync {
            model.data?.let { it.settings = it.settings.copy(language = language) }
        }
        compose.setContent {
            CompositionLocalProvider(LocalLanguage provides language, LocalCalendar provides "jalali",
                LocalLayoutDirection provides if (language == "fa") LayoutDirection.Rtl else LayoutDirection.Ltr) {
                MaterialTheme(colorScheme = medoraColorScheme(dark), typography = medoraTypography(language), shapes = MedoraShapes) {
                    androidx.compose.foundation.layout.Box(
                        androidx.compose.ui.Modifier.then(if (compact) androidx.compose.ui.Modifier.width(320.dp) else androidx.compose.ui.Modifier.fillMaxWidth())
                    ) { HealthScreen(model, {}, {}, {}) }
                }
            }
        }
        compose.waitUntil(15000) { model.data != null && !model.busy }
        compose.waitForIdle()
    }

    @OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)
    private fun capture(name: String) {
        compose.waitForIdle()
        val directory = File(application.getExternalFilesDir(null), "screenshots").apply { mkdirs() }
        compose.mainClock.advanceTimeByFrame()
        compose.waitForIdle()
        val bitmap = (if (name.contains("settings") || name.contains("appearance-editor")) compose.onNode(isDialog()) else compose.onRoot()).captureToImage().asAndroidBitmap()
        File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    @Test fun mainScreensFormsAndWaterPersistence() {
        launch()
        capture("01-today-fa")
        compose.onNodeWithText("ثبت آب").performScrollTo().performClick()
        compose.onNodeWithText("ثبت آب", substring = true).assertExists()
        capture("02-water-sheet")
        compose.onNodeWithText("۵۰۰", useUnmergedTree = true).performClick()
        compose.onNodeWithText("ذخیره").performScrollTo().performClick()
        compose.waitUntil(15000) { !model.busy && model.data?.total(LocalDate.now().toString()) == 1700 }
        assertEquals(1700, Repository.executor.submit<Int> { Repository.get(application).read().total(LocalDate.now().toString()) }.get())
        compose.onNodeWithTag("open-water").performScrollTo().performClick()
        capture("03-water-fa")
        compose.onNodeWithTag("nav-2").performClick()
        capture("04-medications-fa")
        compose.onNodeWithText("داروی جدید").performClick()
        capture("05-medication-form")
        compose.onNodeWithContentDescription("بستن").performClick()
        compose.onNodeWithTag("nav-3").performClick()
        capture("06-appointments-fa")
        compose.onNodeWithText("قرار جدید").performScrollTo().performClick()
        capture("07-appointment-form")
        compose.onNodeWithContentDescription("بستن").performClick()
        compose.onNodeWithTag("nav-insights").performClick()
        compose.onNodeWithTag("page-calendar").performClick()
        capture("08-calendar-fa")
        compose.onNodeWithContentDescription("بستن").performClick()
        compose.onNodeWithTag("nav-insights").performClick()
        compose.onNodeWithTag("page-reports").performClick()
        capture("09-reports-fa")
        compose.onNodeWithTag("settings").performClick()
        capture("10-settings-fa")
    }

    @Test fun medicationTabDoesNotDisplayAppointmentsAfterNavigation() {
        launch()
        compose.onNodeWithTag("nav-3").performClick()
        compose.onNodeWithText("ویزیت متخصص قلب").assertExists()
        compose.onNodeWithTag("nav-2").performClick()
        compose.onNodeWithText("ویزیت متخصص قلب").assertDoesNotExist()
        compose.onNodeWithText("قرار جدید").assertDoesNotExist()
        compose.onNodeWithTag("nav-0").performClick()
        compose.onNodeWithTag("nav-2").performClick()
        compose.onNodeWithText("ویزیت متخصص قلب").assertDoesNotExist()
        compose.onNodeWithText("داروی جدید").assertExists()
    }

    @Test fun darkThemeAndEnglishNavigationRender() {
        launch(dark = true, language = "en")
        capture("11-today-dark-en")
        compose.onNodeWithTag("nav-1").performClick()
        capture("12-water-dark-en")
    }

    private fun verifyCompactDock(language: String, dark: Boolean) {
        launch(dark = dark, language = language, compact = true)
        val tags = listOf("settings", "nav-insights", "nav-0", "nav-2", "nav-3")
        tags.forEach { compose.onNodeWithTag(it).assertIsDisplayed() }
        val bounds = tags.map { compose.onNodeWithTag(it).fetchSemanticsNode().boundsInRoot }
        bounds.zipWithNext().forEach { (left, right) -> org.junit.Assert.assertTrue(left.right <= right.left + 1f) }
        compose.onNodeWithTag("nav-0").assertIsSelected()
        compose.onNodeWithTag("today-medications").assertExists()
        compose.onNodeWithTag("today-appointments").assertExists()
        capture("compact-$language-$dark-today")
        compose.onNodeWithTag("nav-insights").performClick()
        compose.onNodeWithTag("page-calendar").assertIsDisplayed()
        compose.onNodeWithTag("page-reports").performClick()
        capture("compact-$language-$dark-reports")
        compose.onNodeWithTag("nav-2").performClick()
        compose.onNodeWithText("ویزیت متخصص قلب").assertDoesNotExist()
        compose.onNodeWithTag("nav-2").assertIsSelected()
        capture("compact-$language-$dark-medications")
        compose.onNodeWithTag("nav-3").performClick()
        compose.onNodeWithText("ویزیت متخصص قلب").assertExists()
        compose.onNodeWithTag("nav-3").assertIsSelected()
        compose.onNodeWithTag("settings").performClick()
        compose.onNodeWithText(localizedText("settings.title", language)).assertExists()
        capture("compact-$language-$dark-settings")
    }

    @Test fun compactPersianLightNavigation() = verifyCompactDock("fa", false)
    @Test fun compactEnglishDarkNavigation() = verifyCompactDock("en", true)
    @Test fun compactPersianDarkNavigation() = verifyCompactDock("fa", true)
    @Test fun compactEnglishLightNavigation() = verifyCompactDock("en", false)

    @Test fun welcomeRendersWithoutFakeLogin() {
        compose.setContent {
            CompositionLocalProvider(LocalLanguage provides "fa", LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme(colorScheme = medoraColorScheme(false), typography = medoraTypography("fa"), shapes = MedoraShapes) {
                    WelcomeScreen {}
                }
            }
        }
        compose.onNodeWithText("شروع کنید").performScrollTo().assertExists()
        capture("00-welcome-fa")
    }
}
