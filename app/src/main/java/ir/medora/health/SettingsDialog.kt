package ir.medora.health

import android.app.TimePickerDialog
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.time.Instant
import java.time.LocalTime

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsDialog(
    vm: HealthViewModel,
    close: () -> Unit,
    onSaved: () -> Unit,
    requestPermission: () -> Unit,
    openNotifications: () -> Unit,
    openExact: () -> Unit
) {
    val data = vm.data ?: return
    var tab by remember { mutableIntStateOf(0) }
    var goal by remember(data.settings.goal) { mutableStateOf(data.settings.goal.toString()) }
    var waterEnabled by remember(data.settings.waterEnabled) { mutableStateOf(data.settings.waterEnabled) }
    var start by remember(data.settings.start) { mutableStateOf(data.settings.start) }
    var end by remember(data.settings.end) { mutableStateOf(data.settings.end) }
    var interval by remember(data.settings.interval) { mutableIntStateOf(data.settings.interval) }
    var repeatMinutes by remember(data.settings.repeat) { mutableIntStateOf(data.settings.repeat) }
    var pauseUntil by remember(data.settings.pauseUntil) { mutableLongStateOf(data.settings.pauseUntil) }
    var showDetails by remember(data.settings.privateNotifications) { mutableStateOf(!data.settings.privateNotifications) }
    var appointmentStart by remember(data.settings.appointmentStart) { mutableStateOf(data.settings.appointmentStart) }
    var appointmentInterval by remember(data.settings.appointmentInterval) { mutableIntStateOf(data.settings.appointmentInterval) }
    var language by remember(data.settings.language) { mutableStateOf(data.settings.language) }
    var calendar by remember(data.settings.calendar) { mutableStateOf(data.settings.calendar) }
    var advanced by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scroll = rememberScrollState()
    val context = LocalContext.current

    fun save() {
        try {
            val parsedGoal = normalize(goal).toIntOrNull()
            if (parsedGoal == null || parsedGoal !in 1..20000) {
                error = "validation.goal"
                return
            }
            if (LocalTime.parse(start) >= LocalTime.parse(end)) {
                error = "validation.waterWindow"
                return
            }
            error = null
            val updated = data.settings.copy(
                goal = parsedGoal,
                waterEnabled = waterEnabled,
                start = start,
                end = end,
                interval = interval,
                repeat = repeatMinutes,
                pauseUntil = pauseUntil,
                privateNotifications = !showDetails,
                appointmentStart = appointmentStart,
                appointmentInterval = appointmentInterval,
                language = language,
                calendar = calendar
            )
            vm.change({ current -> current.settings = updated.copy(consent = current.settings.consent) }, onSaved)
        } catch (_: NumberFormatException) {
            error = "error.number"
        } catch (_: Exception) {
            error = "error.generic"
        }
    }

    CompositionLocalProvider(
        LocalLanguage provides language,
        LocalCalendar provides calendar,
        androidx.compose.ui.platform.LocalLayoutDirection provides
            if (language == "fa") androidx.compose.ui.unit.LayoutDirection.Rtl else androidx.compose.ui.unit.LayoutDirection.Ltr
    ) {
        MaterialTheme(colorScheme = MaterialTheme.colorScheme, typography = medoraTypography(language)) {
            Dialog(onDismissRequest = { if (!vm.busy) close() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
                val maxHeight = (context.resources.displayMetrics.heightPixels / context.resources.displayMetrics.density * .90f).dp
                Surface(
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(24.dp),
                    color = MaterialTheme.colorScheme.background,
                    modifier = Modifier.padding(12.dp).widthIn(max = 560.dp).fillMaxWidth()
                ) {
                    Column(
                        Modifier.heightIn(max = maxHeight).imePadding().padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(tr("settings.title"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                Text(tr("settings.subtitle"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            IconButton(onClick = close, enabled = !vm.busy, modifier = Modifier.size(48.dp)) {
                                Icon(Icons.Default.Close, contentDescription = tr("common.close"))
                            }
                        }
                        DisplayPreferences(
                            language = language,
                            calendar = calendar,
                            onLanguage = { language = it },
                            onCalendar = { calendar = it }
                        )
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf("settings.waterTab", "settings.appointmentsTab", "settings.notificationsTab").forEachIndexed { index, key ->
                                val selected = tab == index
                                Surface(
                                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                                    contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                    shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
                                    border = if (selected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                    modifier = Modifier.weight(1f).selectable(selected = selected, role = Role.Tab, onClick = { tab = index })
                                ) {
                                    Box(Modifier.heightIn(min = 48.dp).padding(horizontal = 4.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
                                        Text(tr(key), maxLines = 1, style = MaterialTheme.typography.labelLarge)
                                    }
                                }
                            }
                        }
                        Column(
                            Modifier.weight(1f, fill = false).verticalScroll(scroll),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            when (tab) {
                                0 -> WaterSettings(
                                    goal, { goal = it }, waterEnabled, { waterEnabled = it }, start, { start = it },
                                    end, { end = it }, interval, { next -> interval = next; if (repeatMinutes >= next) repeatMinutes = 0 },
                                    repeatMinutes, { repeatMinutes = it }, advanced, { advanced = it }, pauseUntil, { pauseUntil = it }
                                )
                                1 -> AppointmentSettings(appointmentStart, { appointmentStart = it }, appointmentInterval, { appointmentInterval = it })
                                else -> NotificationSettings(data, vm, showDetails, { showDetails = it }, requestPermission, openNotifications, openExact)
                            }
                            error?.let { Text(tr(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                            vm.error?.let { Text(tr(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                        }
                        Button(onClick = ::save, enabled = !vm.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)) {
                            Text(if (vm.busy) tr("common.saving") else tr("common.saveSettings"))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DisplayPreferences(
    language: String,
    calendar: String,
    onLanguage: (String) -> Unit,
    onCalendar: (String) -> Unit
) {
    Panel(compact = true) {
        Text(tr("settings.display"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Text(tr("settings.language"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = language == "fa", onClick = { onLanguage("fa") }, label = { Text(tr("settings.persian")) }, modifier = Modifier.weight(1f))
            FilterChip(selected = language == "en", onClick = { onLanguage("en") }, label = { Text("English") }, modifier = Modifier.weight(1f))
        }
        Text(tr("settings.calendar"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = calendar == "jalali", onClick = { onCalendar("jalali") }, label = { Text(tr("settings.solar")) }, modifier = Modifier.weight(1f))
            FilterChip(selected = calendar == "gregorian", onClick = { onCalendar("gregorian") }, label = { Text(tr("settings.gregorian")) }, modifier = Modifier.weight(1f))
        }
        Text(tr("settings.calendarNote"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WaterSettings(
    goal: String,
    onGoal: (String) -> Unit,
    enabled: Boolean,
    onEnabled: (Boolean) -> Unit,
    start: String,
    onStart: (String) -> Unit,
    end: String,
    onEnd: (String) -> Unit,
    interval: Int,
    onInterval: (Int) -> Unit,
    repeatMinutes: Int,
    onRepeat: (Int) -> Unit,
    advanced: Boolean,
    onAdvanced: (Boolean) -> Unit,
    pauseUntil: Long,
    onPause: (Long) -> Unit
) {
    Panel(compact = true) {
        Text(tr("settings.waterGoal"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        OutlinedTextField(
            value = localizedNumber(normalize(goal), LocalLanguage.current),
            onValueChange = { onGoal(normalize(it)) },
            singleLine = true,
            label = { Text(tr("settings.waterGoal")) },
            suffix = { Text(tr("unit.ml")) },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
            modifier = Modifier.fillMaxWidth()
        )
    }
    Panel(compact = true) {
        SwitchRow(tr("water.reminder"), enabled, onEnabled)
        if (enabled) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TimeSetting(tr("water.start"), start, onStart, Modifier.weight(1f))
                TimeSetting(tr("water.end"), end, onEnd, Modifier.weight(1f))
            }
            Text(tr("water.interval"), style = MaterialTheme.typography.bodyMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (listOf(30, 60, 120) + interval).distinct().sorted().forEach { minutes ->
                    val label = when {
                        minutes < 60 -> tr("water.everyMinutes", n(minutes))
                        minutes == 60 -> tr("water.everyHour")
                        else -> tr("water.hours", n(minutes / 60))
                    }
                    FilterChip(selected = interval == minutes, onClick = { onInterval(minutes) }, label = { Text(label) })
                }
            }
            TextButton(onClick = { onAdvanced(!advanced) }) {
                Icon(if (advanced) Icons.Default.ExpandLess else Icons.Default.ExpandMore, contentDescription = null)
                Spacer(Modifier.width(4.dp))
                Text(tr("water.more"))
            }
            if (advanced) {
                Text(tr("water.retryDescription"), style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (listOf(0, 5, 10, 15) + repeatMinutes).distinct().filter { it < interval }.forEach { minutes ->
                        FilterChip(
                            selected = repeatMinutes == minutes,
                            onClick = { onRepeat(minutes) },
                            label = { Text(if (minutes == 0) tr("water.off") else tr("water.afterMinutes", n(minutes))) }
                        )
                    }
                }
                val paused = pauseUntil > Instant.now().toEpochMilli()
                OutlinedButton(
                    onClick = { onPause(if (paused) 0 else Instant.now().plusSeconds(3600).toEpochMilli()) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text(if (paused) tr("water.resume") else tr("water.pause")) }
            }
        }
    }
}

@Composable
private fun AppointmentSettings(
    start: String,
    onStart: (String) -> Unit,
    interval: Int,
    onInterval: (Int) -> Unit
) {
    Panel(compact = true) {
        Text(tr("appointment.clinicStart"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Text(tr("appointment.settingsExplanation"), style = MaterialTheme.typography.bodyMedium)
        TimeSetting(tr("appointment.startTime"), start, onStart)
        Text(tr("appointment.repeatUntil"), style = MaterialTheme.typography.bodyMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(60, 120).forEach { minutes ->
                val label = if (minutes == 60) tr("appointment.everyHour") else tr("appointment.everyHours", n(minutes / 60))
                FilterChip(selected = interval == minutes, onClick = { onInterval(minutes) }, label = { Text(label) }, modifier = Modifier.weight(1f))
            }
        }
        Text(tr("appointment.earlyVisit"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun NotificationSettings(
    data: HealthData,
    vm: HealthViewModel,
    showDetails: Boolean,
    onShowDetails: (Boolean) -> Unit,
    requestPermission: () -> Unit,
    openNotifications: () -> Unit,
    openExact: () -> Unit
) {
    Panel(compact = true) {
        SwitchRow(tr("settings.notificationsEnabled"), data.settings.consent && vm.enabled) {
            if (it) requestPermission() else vm.change({ current -> current.settings = current.settings.copy(consent = false) })
        }
        SwitchRow(tr("settings.reminderDetails"), showDetails, onShowDetails)
        Text(
            tr(if (showDetails) "settings.notificationDetailsOn" else "settings.notificationDetailsOff"),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        HorizontalDivider()
        Text(tr("settings.sampleNotification"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        Text(
            if (showDetails) tr("notification.doseTitle", tr("settings.sampleMedicine")) else tr("notification.brand"),
            style = MaterialTheme.typography.titleSmall
        )
        Text(tr(if (showDetails) "settings.sampleBody" else "notification.privateBody"), style = MaterialTheme.typography.bodySmall)
    }
    Panel(compact = true) {
        Text(tr("settings.phonePermissions"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        if (vm.exact) Text(tr("settings.exactEnabled"), color = MedoraColors.Success)
        else OutlinedButton(onClick = openExact, modifier = Modifier.fillMaxWidth()) { Text(tr("settings.enableExact")) }
        TextButton(onClick = openNotifications) { Text(tr("settings.openNotificationSettings")) }
    }
}

@Composable
fun TimeSetting(label: String, value: String, change: (String) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val language = LocalLanguage.current
    OutlinedButton(
        onClick = {
            val time = LocalTime.parse(value)
            TimePickerDialog(context.withAppLocale(language), { _, hour, minute -> change(LocalTime.of(hour, minute).toString()) }, time.hour, time.minute, true).show()
        },
        modifier = modifier.fillMaxWidth().heightIn(min = 50.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, style = MaterialTheme.typography.labelSmall)
            Text(displayTime(value), style = MaterialTheme.typography.titleMedium)
        }
    }
}
