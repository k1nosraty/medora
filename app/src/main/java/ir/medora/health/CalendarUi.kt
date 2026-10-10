package ir.medora.health

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.time.LocalDate

@Composable
fun CalendarDatePickerDialog(
    selectedDate: LocalDate,
    calendar: String,
    language: String,
    maximumDate: LocalDate? = null,
    onDismiss: () -> Unit,
    onSelect: (LocalDate) -> Unit
) {
    var shownMonth by remember(selectedDate, calendar) {
        mutableStateOf(CalendarSupport.startOfMonth(selectedDate, calendar))
    }
    var pickedDate by remember(selectedDate) { mutableStateOf(selectedDate) }
    val firstWeekday = CalendarSupport.firstDayOfWeek(language)
    val monthLength = CalendarSupport.monthLength(shownMonth, calendar)
    val leadingDays = Math.floorMod(shownMonth.dayOfWeek.value - firstWeekday, 7)
    val context = LocalContext.current
    val maxHeight = (context.resources.displayMetrics.heightPixels / context.resources.displayMetrics.density * .88f).dp

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.padding(16.dp).widthIn(max = 420.dp).fillMaxWidth().heightIn(max = maxHeight)
        ) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(tr("datePicker.title"), style = MaterialTheme.typography.titleLarge)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = { shownMonth = CalendarSupport.plusMonths(shownMonth, -1, calendar) },
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = tr("a11y.previousMonth"))
                    }
                    Text(
                        CalendarSupport.monthTitle(shownMonth, calendar, language),
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                    IconButton(
                        onClick = { shownMonth = CalendarSupport.plusMonths(shownMonth, 1, calendar) },
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = tr("a11y.nextMonth"))
                    }
                }
                Row(Modifier.fillMaxWidth()) {
                    CalendarSupport.shortWeekdays(language).forEach { key ->
                        val fullLabel = localizedText(key.removeSuffix("Short"), language)
                        Box(
                            Modifier.weight(1f).height(36.dp).semantics { contentDescription = fullLabel },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(tr(key), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                repeat(6) { row ->
                    Row(Modifier.fillMaxWidth()) {
                        repeat(7) { column ->
                            val index = row * 7 + column - leadingDays
                            val date = if (index in 0 until monthLength) shownMonth.plusDays(index.toLong()) else null
                            if (date == null) {
                                Spacer(Modifier.weight(1f).height(48.dp))
                            } else {
                                val enabled = maximumDate == null || !date.isAfter(maximumDate)
                                val isSelected = date == pickedDate
                                val isToday = date == LocalDate.now()
                                val accessibleDate = "${localizedText("a11y.openDate", language)}: ${CalendarSupport.formatDate(date, calendar, language)}"
                                val background = when {
                                    isSelected -> MaterialTheme.colorScheme.primary
                                    else -> MaterialTheme.colorScheme.surface
                                }
                                val foreground = when {
                                    isSelected -> MaterialTheme.colorScheme.onPrimary
                                    !enabled -> MaterialTheme.colorScheme.onSurface.copy(alpha = .35f)
                                    else -> MaterialTheme.colorScheme.onSurface
                                }
                                Box(
                                    Modifier.weight(1f).height(48.dp).padding(2.dp)
                                        .clip(CircleShape)
                                        .background(background)
                                        .semantics {
                                            contentDescription = accessibleDate
                                            selected = isSelected
                                        }
                                        .clickable(enabled = enabled, role = Role.Button) { pickedDate = date },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        localizedNumber(CalendarSupport.dayOfMonth(date, calendar), language),
                                        color = foreground,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = if (isSelected || isToday) androidx.compose.ui.text.font.FontWeight.Bold else null
                                    )
                                }
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onDismiss) { Text(tr("common.cancel")) }
                    Row {
                        TextButton(onClick = {
                            val today = LocalDate.now()
                            pickedDate = today
                            shownMonth = CalendarSupport.startOfMonth(today, calendar)
                        }) { Text(tr("common.today")) }
                        Button(
                            onClick = { onSelect(pickedDate) },
                            enabled = maximumDate == null || !pickedDate.isAfter(maximumDate)
                        ) { Text(tr("common.select")) }
                    }
                }
            }
        }
    }
}
