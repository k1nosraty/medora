package ir.medora.health

import android.app.Application
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

    private fun launch(dark: Boolean = false, language: String = "fa") {
        compose.setContent {
            CompositionLocalProvider(LocalLanguage provides language, LocalCalendar provides "jalali",
                LocalLayoutDirection provides if (language == "fa") LayoutDirection.Rtl else LayoutDirection.Ltr) {
                MaterialTheme(colorScheme = medoraColorScheme(dark), typography = medoraTypography(language), shapes = MedoraShapes) {
                    HealthScreen(model, {}, {}, {})
                }
            }
        }
        compose.waitUntil(15000) { model.data != null && !model.busy }
        compose.waitForIdle()
    }

    private fun capture(name: String) {
        compose.waitForIdle()
        val directory = File(application.getExternalFilesDir(null), "screenshots").apply { mkdirs() }
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
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
        compose.onNodeWithTag("nav-1").performClick()
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
        compose.onNodeWithTag("more-pages").performClick()
        compose.onNodeWithTag("page-calendar").performClick()
        capture("08-calendar-fa")
        compose.onNodeWithContentDescription("بستن").performClick()
        compose.onNodeWithTag("more-pages").performClick()
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
