package ir.medora.health

import android.app.TimePickerDialog
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TimeDialogTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun localizedTimeDialogsShowAndDismissWithoutLosingActivityWindow() {
        compose.runOnUiThread {
            listOf("fa", "en").forEach { language ->
                val context = compose.activity.withAppLocale(language)
                val dialog = TimePickerDialog(context, { _, _, _ -> }, 8, 0, true)
                dialog.show()
                assertTrue(dialog.isShowing)
                dialog.dismiss()
            }
        }
    }
}
