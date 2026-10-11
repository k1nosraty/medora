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
    var tab by remember { mutableIntStateOf(-1) }
    var medicationSnooze by remember(data.settings.medicationSnoozeMinutes) { mutableStateOf(data.settings.medicationSnoozeMinutes.toString()) }
    var customSnooze by remember { mutableStateOf(data.settings.medicationSnoozeMinutes !in listOf(10,30,60)) }
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
            val parsedSnooze = normalize(medicationSnooze).toIntOrNull()
            if (parsedSnooze == null || parsedSnooze !in 1..1440) { error = "validation.medicationSnooze"; return }
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
                calendar = calendar,
                medicationSnoozeMinutes = parsedSnooze
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
                        Modifier.heightIn(max = maxHeight).imePadding().padding(bottom=16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        MedoraHeader(tr("settings.title"),tr(if(tab<0) "settings.subtitle" else when(tab) {
                            0 -> "settings.waterTab";1 -> "settings.medicationsTab";2 -> "settings.appointmentsTab";3 -> "settings.notificationsTab";else -> "settings.display"
                        }),onBack=if(tab>=0) ({tab=-1}) else null,onClose={if(!vm.busy) close()})
                        Column(
                            Modifier.weight(1f, fill = false).verticalScroll(scroll).padding(horizontal=16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            when (tab) {
                                -1 -> {
                                    SettingsCategoryTile(tr("settings.display"),tr("settings.language"),4) {tab=4}
                                    SettingsCategoryTile(tr("settings.notificationsTab"),tr("settings.phonePermissions"),3) {tab=3}
                                    SettingsCategoryTile(tr("settings.waterTab"),tr("settings.waterGoal"),0) {tab=0}
                                    SettingsCategoryTile(tr("settings.medicationsTab"),tr("settings.medicationSnooze"),1) {tab=1}
                                    SettingsCategoryTile(tr("settings.appointmentsTab"),tr("appointment.earlyReminders"),2) {tab=2}
                                }
                                4 -> DisplayPreferences(language,calendar,{language=it},{calendar=it})
                                0 -> WaterSettings(
                                    goal, { goal = it }, waterEnabled, { waterEnabled = it }, start, { start = it },
                                    end, { end = it }, interval, { next -> interval = next; if (repeatMinutes >= next) repeatMinutes = 0 },
                                    repeatMinutes, { repeatMinutes = it }, advanced, { advanced = it }, pauseUntil, { pauseUntil = it }
                                )
                                1 -> MedicationSnoozeSettings(medicationSnooze, { medicationSnooze = it }, customSnooze, { customSnooze = it })
                                2 -> AppointmentSettings(appointmentStart, { appointmentStart = it }, appointmentInterval, { appointmentInterval = it })
                                else -> NotificationSettings(data, vm, showDetails, { showDetails = it }, requestPermission, openNotifications, openExact)
                            }
                            error?.let { Text(tr(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                            vm.error?.let { Text(tr(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                        }
                        Button(onClick = ::save, enabled = !vm.busy, modifier = Modifier.fillMaxWidth().padding(horizontal=16.dp).heightIn(min = 50.dp)) {
                            if(vm.busy) {CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp);Spacer(Modifier.width(8.dp))}
                            Text(if (vm.busy) tr("common.saving") else tr("common.saveSettings"))
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
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
        LocalAppearance.current?.let { appearance ->
            Text(tr("design.theme"),style=MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                listOf("system","light","dark").forEach { option ->
                    FilterChip(selected=appearance.theme==option,onClick={appearance.chooseTheme(option)},label={Text(tr("design.theme.$option"))})
                }
            }
        }

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
    Panel(color=wellnessTint(MedoraColors.WaterContainer),compact = true) {
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
    Panel(color=wellnessTint(MedoraColors.Lavender),compact = true) {
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
        if (vm.exact) Text(tr("settings.exactEnabled"), color = wellnessAccent(MedoraColors.Success))
        else OutlinedButton(onClick = openExact, modifier = Modifier.fillMaxWidth()) { Text(tr("settings.enableExact")) }
        TextButton(onClick = openNotifications) { Text(tr("settings.openNotificationSettings")) }
    }
}

@Composable
fun TimeSetting(label: String, value: String, change: (String) -> Unit, modifier: Modifier = Modifier) {
    var picker by remember {mutableStateOf(false)}
    val time = remember(value) {runCatching {LocalTime.parse(value)}.getOrDefault(LocalTime.of(8,0))}
    OutlinedButton(
        onClick = {picker=true},
        modifier = modifier.fillMaxWidth().heightIn(min = 50.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, style = MaterialTheme.typography.labelSmall)
            Text(displayTime(value), style = MaterialTheme.typography.titleMedium)
        }
    }
    if(picker) MedoraTimePicker(time,{picker=false},{hour,minute -> change(LocalTime.of(hour,minute).toString());picker=false})

}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MedicationSnoozeSettings(value:String,onValue:(String)->Unit,custom:Boolean,onCustom:(Boolean)->Unit) {
    Panel(color=wellnessTint(MedoraColors.Warm),compact=true) {
        Text(tr("settings.medicationSnooze"),style=MaterialTheme.typography.titleSmall,fontWeight=FontWeight.SemiBold)
        Text(tr("settings.snoozeNote"),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            listOf(10,30,60).forEach { minutes ->
                FilterChip(selected=!custom && normalize(value)==minutes.toString(),onClick={onCustom(false);onValue(minutes.toString())},
                    modifier=Modifier.heightIn(min=48.dp),label={Text(tr("settings.minutes",n(minutes)))})
            }
            FilterChip(selected=custom,onClick={onCustom(true)},modifier=Modifier.heightIn(min=48.dp),label={Text(tr("settings.customSnooze"))})
        }
        if(custom) Input(value,{onValue(normalize(it))},tr("settings.snoozeMinutes"),helper=tr("validation.medicationSnooze"),keyboardType=androidx.compose.ui.text.input.KeyboardType.Number)
    }
}
