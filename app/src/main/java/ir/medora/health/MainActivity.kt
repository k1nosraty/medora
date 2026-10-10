package ir.medora.health

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings as AndroidSettings
import androidx.activity.compose.BackHandler
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

class MainActivity : ComponentActivity() {
    private lateinit var model: HealthViewModel
    private var clockReceiverRegistered = false
    private val rolloverHandler = Handler(Looper.getMainLooper())
    private val rolloverTask = object : Runnable {
        override fun run() {
            if (::model.isInitialized) model.refresh()
            scheduleRolloverRefresh()
        }
    }
    private val clockReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (::model.isInitialized) model.refresh()
            scheduleRolloverRefresh()
        }
    }
    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        model.change({ it.settings = it.settings.copy(consent = granted) })
    }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        model = ViewModelProvider(this)[HealthViewModel::class.java]
        setContent {
            val language = model.data?.settings?.language ?: "fa"
            val calendar = model.data?.settings?.calendar ?: "jalali"
            CompositionLocalProvider(
                LocalLanguage provides language,
                LocalCalendar provides calendar,
                androidx.compose.ui.platform.LocalLayoutDirection provides
                    if (language == "fa") androidx.compose.ui.unit.LayoutDirection.Rtl else androidx.compose.ui.unit.LayoutDirection.Ltr
            ) {
                MaterialTheme(colorScheme = medoraColorScheme(), typography = medoraTypography(language), shapes = MedoraShapes) {
                    HealthScreen(model, ::requestNotifications, ::openNotificationSettings, ::openExactSettings)
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (!clockReceiverRegistered) {
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_DATE_CHANGED)
                addAction(Intent.ACTION_TIME_CHANGED)
                addAction(Intent.ACTION_TIMEZONE_CHANGED)
            }
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(clockReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                registerReceiver(clockReceiver, filter)
            }
            clockReceiverRegistered = true
        }
        scheduleRolloverRefresh()
    }

    override fun onResume() {
        super.onResume()
        if (::model.isInitialized && !model.busy) model.refresh()
        scheduleRolloverRefresh()
    }

    override fun onStop() {
        rolloverHandler.removeCallbacks(rolloverTask)
        if (clockReceiverRegistered) {
            unregisterReceiver(clockReceiver)
            clockReceiverRegistered = false
        }
        super.onStop()
    }

    private fun scheduleRolloverRefresh() {
        rolloverHandler.removeCallbacks(rolloverTask)
        if (!::model.isInitialized) return
        val now = ZonedDateTime.now()
        val nextDay = now.toLocalDate().plusDays(1).atStartOfDay(now.zone).plusSeconds(1)
        val delay = (nextDay.toInstant().toEpochMilli() - Instant.now().toEpochMilli()).coerceAtLeast(1)
        rolloverHandler.postDelayed(rolloverTask, delay)
    }

    private fun requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        else model.change({ it.settings = it.settings.copy(consent = true) })
    }

    private fun openNotificationSettings() = startActivity(
        Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(AndroidSettings.EXTRA_APP_PACKAGE, packageName)
    )

    private fun openExactSettings() {
        if (Build.VERSION.SDK_INT >= 31) startActivity(
            Intent(AndroidSettings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))
        )
    }
}

data class Editor(val kind: String, val water: Water? = null, val medication: Medication? = null, val appointment: Appointment? = null, val date: String? = null)
private data class PendingDeletion(val messageKey: String, val mutation: (HealthData) -> Unit)

@Composable
fun Panel(
    color: Color = MaterialTheme.colorScheme.surface,
    compact: Boolean = false,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        shape = RoundedCornerShape(24.dp),
        color = color,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            Modifier.padding(if (compact) 14.dp else MedoraSpacing.Card),
            verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 10.dp),
            content = content
        )
    }
}

@Composable
fun Heading(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = modifier)
}

@Composable
fun Empty(text: String, action: (@Composable () -> Unit)? = null) {
    Panel(color = MaterialTheme.colorScheme.surfaceVariant, compact = true) {
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        action?.invoke()
    }
}

@Composable
fun displayDate(day: LocalDate, includeWeekday: Boolean = false): String =
    CalendarSupport.formatDate(day, LocalCalendar.current, LocalLanguage.current, includeWeekday)

@Composable
fun displayTime(time: Any): String = localizedNumber(time, LocalLanguage.current)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HealthScreen(vm: HealthViewModel, requestPermission: () -> Unit, openNotification: () -> Unit, openExact: () -> Unit) {
    val data = vm.data
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var secondary by rememberSaveable { mutableStateOf<String?>(null) }
    BackHandler(enabled = secondary != null) { secondary = null }
    val context = LocalContext.current
    val intro = remember { context.getSharedPreferences("medora_ui", Context.MODE_PRIVATE) }
    var welcomed by rememberSaveable { mutableStateOf(intro.getBoolean("welcomed", false)) }
    var history by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var showHistoryPicker by remember { mutableStateOf(false) }
    var editor by remember { mutableStateOf<Editor?>(null) }
    var deletion by remember { mutableStateOf<PendingDeletion?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }
    val snackbarScope = rememberCoroutineScope()
    val language = LocalLanguage.current
    val calendar = LocalCalendar.current

    if (data == null) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            if (vm.error == null) CircularProgressIndicator()
            else Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(tr(vm.error!!), color = MaterialTheme.colorScheme.error)
                Button(onClick = vm::refresh) { Text(tr("common.retry")) }
            }
        }
        return
    }
    val hasExistingData = data.water.isNotEmpty() || data.medications.isNotEmpty() ||
        data.appointments.isNotEmpty() || data.doses.isNotEmpty() || data.settings != Settings()
    if (!welcomed && !hasExistingData) {
        WelcomeScreen {
            intro.edit().putBoolean("welcomed", true).apply()
            welcomed = true
        }
        return
    }
    val historyDate = LocalDate.parse(history)


    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                title = {
                    if (secondary != null) Text(tr(if (secondary == "water") "nav.water" else "nav.insights"),
                        style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    else if (tab == 0) Column {
                        Text(tr("today.greeting"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(displayDate(LocalDate.now(), true), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else Text(tr(if (tab == 2) "nav.medications" else "nav.appointments"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                },
                navigationIcon = {
                    if (secondary != null) IconButton(onClick = { secondary = null }) {
                        Icon(androidx.compose.material.icons.Icons.AutoMirrored.Filled.ArrowBack, tr("common.close"))
                    }
                },
                actions = {}
            )
        },
        bottomBar = {
            WellnessNavigationDock(
                selected = if (editor?.kind == "settings") "settings" else if (secondary == "calendar" || secondary == "reports") "insights"
                    else if (secondary == "water") "today" else when (tab) { 2 -> "medications"; 3 -> "appointments"; else -> "today" },
                onSelect = { destination ->
                    when (destination) {
                        "settings" -> editor = Editor("settings")
                        "insights" -> secondary = "calendar"
                        else -> {
                            tab = when (destination) { "medications" -> 2; "appointments" -> 3; else -> 0 }
                            secondary = null
                        }
                    }
                }
            )
        }
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            Column(
                Modifier.widthIn(max = 760.dp).fillMaxWidth().weight(1f)
                    .verticalScroll(rememberScrollState()).padding(horizontal = MedoraSpacing.Page, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                vm.error?.let { ErrorNotice(tr(it)) }
                androidx.compose.runtime.key(tab, secondary) {
                if (secondary == "calendar" || secondary == "reports") {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("calendar" to "nav.calendar", "reports" to "nav.reports").forEach { (page, label) ->
                            FilterChip(selected = secondary == page, onClick = { secondary = page },
                                label = { Text(tr(label)) }, modifier = Modifier.testTag("page-$page"))
                        }
                    }
                }
                if (secondary == "water") WaterScreen(data, historyDate, { showHistoryPicker = true },
                    { editor = it.copy(date = history) }, { deletion = it }, vm)
                else if (secondary == "calendar") ActivityCalendarScreen(data, vm, { editor = it })
                else if (secondary == "reports") ReportsScreen(data)
                else when (tab) {
                    0 -> TodayScreen(data, vm, requestPermission, openNotification, { tab = 2; history = LocalDate.now().toString() }, { secondary = "water"; history = LocalDate.now().toString() }) { editor = it }
                    1 -> WaterScreen(data, historyDate, { showHistoryPicker = true }, { editor = it.copy(date = history) }, { deletion = it }, vm)
                    2 -> MedicationScreen(data, historyDate, { showHistoryPicker = true }, { editor = it }, { deletion = it }, vm)
                    else -> AppointmentScreen(data, { editor = it }, { deletion = it }, vm)
                }
                }
            }
        }
    }

    if (showHistoryPicker) {
        CalendarDatePickerDialog(
            selectedDate = historyDate,
            calendar = calendar,
            language = language,
            maximumDate = LocalDate.now(),
            onDismiss = { showHistoryPicker = false },
            onSelect = { history = it.toString(); showHistoryPicker = false }
        )
    }
    deletion?.let { pending ->
        AlertDialog(
            onDismissRequest = { deletion = null },
            title = { Text(tr("common.delete")) },
            text = { Text(tr(pending.messageKey)) },
            confirmButton = {
                Button(onClick = { vm.change(pending.mutation) { deletion = null } }, enabled = !vm.busy) {
                    Text(tr("common.delete"))
                }
            },
            dismissButton = { TextButton(onClick = { deletion = null }) { Text(tr("common.cancel")) } }
        )
    }
    editor?.let { current ->
        key(current) {
            EditDialog(
                current,
                vm,
                close = { editor = null },
                onSaved = {
                    editor = null
                    val currentLanguage = vm.data?.settings?.language ?: language
                    snackbarScope.launch { snackbarHostState.showSnackbar(localizedText("feedback.saved", currentLanguage)) }
                },
                requestPermission = requestPermission,
                openNotifications = openNotification,
                openExact = openExact
            )
        }
    }
}

@Composable
private fun ErrorNotice(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(text, Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun TodayScreen(
    data: HealthData,
    vm: HealthViewModel,
    requestPermission: () -> Unit,
    openNotification: () -> Unit,
    viewMedications: () -> Unit,
    viewWater: () -> Unit,
    openEditor: (Editor) -> Unit
) {
    val today = LocalDate.now()
    val doses = data.dayDoses(today.toString())
    val taken = doses.count { it.status == DoseStatus.TAKEN }
    val nextDose = doses.filter { it.status == DoseStatus.PENDING || it.status == DoseStatus.SNOOZED }.minByOrNull { it.wall }
    val appointment = data.appointments.filter { !it.cancelled && it.instant().isAfter(Instant.now()) }.minByOrNull { it.instant() }
    Surface(color = wellnessTint(MedoraColors.WaterContainer), shape = RoundedCornerShape(14.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Default.Spa, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
            Text(tr("today.title"), style = MaterialTheme.typography.bodySmall)
        }
    }
    WaterProgressCard(data, today) { openEditor(Editor("water")) }
    TextButton(onClick = viewWater, modifier = Modifier.testTag("open-water")) { Text(tr("water.history")) }
    Column(Modifier.fillMaxWidth().testTag("today-medications"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Panel(compact = true) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            WellnessIcon(Icons.Default.Medication, MedoraColors.Medication)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(tr("today.medicationCompact"), fontWeight = FontWeight.Bold)
                Text(if (doses.isEmpty()) tr("today.noMedication") else tr("today.progress", n(taken), n(doses.size)),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick = viewMedications) { Text(tr("today.viewAll"), style = MaterialTheme.typography.labelMedium) }
        }
    }
    if (nextDose != null) DoseCard(nextDose, vm)
    else if (doses.isNotEmpty()) Empty(if (taken == doses.size) tr("today.allDone") else tr("today.progress", n(taken), n(doses.size)))
    else PrimaryAction(tr("today.addMedicine"), { openEditor(Editor("medication")) })
    }
    HorizontalDivider(Modifier.padding(vertical = 6.dp), color = MaterialTheme.colorScheme.outlineVariant)
    Column(Modifier.fillMaxWidth().testTag("today-appointments"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            WellnessIcon(Icons.Default.Event, MedoraColors.Appointment)
            Heading(tr("today.upcomingAppointment"))
        }
    if (appointment != null) {
        AppointmentCard(appointment,
            edit = { openEditor(Editor("appointment", appointment = appointment)) },
            toggle = { vm.change({ it.appointments.replace(appointment.copy(cancelled = !appointment.cancelled)) }) },
            delete = {}, showDelete = false)
    } else PrimaryAction(tr("today.appointmentAction"), { openEditor(Editor("appointment")) })
    }
    if (!data.settings.consent || !vm.enabled) {
        Panel(color = wellnessTint(MedoraColors.WarningContainer), compact = true) {
            Text(tr("permission.title"), fontWeight = FontWeight.SemiBold)
            Text(tr("permission.body"), style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = requestPermission) { Text(tr("permission.enable")) }
                TextButton(onClick = openNotification) { Text(tr("permission.phoneSettings")) }
            }
        }
    }
}

@Composable
private fun WaterScreen(
    data: HealthData,
    day: LocalDate,
    chooseDate: () -> Unit,
    openEditor: (Editor) -> Unit,
    requestDelete: (PendingDeletion) -> Unit,
    vm: HealthViewModel
) {
    DaySelector(day, chooseDate, {}, showArrows = false)
    WaterSummary(data, day) { ml ->
        vm.change({ it.addWater(ml, ZonedDateTime.of(day, LocalTime.now(), ZoneId.systemDefault())) })
    }
    PrimaryAction(tr("water.custom"), { openEditor(Editor("water")) })
    Heading(tr("water.consumption"))
    val entries = data.water.filter { it.day == day.toString() }.sortedByDescending { it.at }
    if (entries.isEmpty()) Empty(tr("water.empty"))
    entries.forEach { entry ->
        Panel(compact = true) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                WellnessIcon(Icons.Default.WaterDrop, MedoraColors.Water)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(tr("water.ml", n(entry.ml)), fontWeight = FontWeight.SemiBold)
                    Text(displayTime(Instant.ofEpochMilli(entry.at).atZone(ZoneId.systemDefault()).toLocalTime().withSecond(0).withNano(0)),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { openEditor(Editor("water", water = entry)) }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.Edit, contentDescription = tr("a11y.editWater"))
                }
                IconButton(onClick = {
                    requestDelete(PendingDeletion("water.deleteConfirm") { it.water.removeAll { item -> item.id == entry.id } })
                }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = tr("a11y.deleteWater"))
                }
            }
        }
    }
}

@Composable
fun WaterSummary(data: HealthData, day: LocalDate, add: (Int) -> Unit) {
    val key = day.toString()
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        WaterGlass(data.progress(key))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (day == LocalDate.now()) tr("date.today") else displayDate(day), fontWeight = FontWeight.SemiBold)
            Text(tr("water.progress", n(data.total(key)), n(data.settings.goal)),
                style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            LinearProgressIndicator(progress = { data.progress(key) }, modifier = Modifier.fillMaxWidth(),
                color = wellnessAccent(MedoraColors.Water), trackColor = wellnessTint(MedoraColors.WaterContainer))
            Text(if (data.remaining(key) == 0) tr("water.goalReached") else tr("water.remaining", n(data.remaining(key))),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf(150, 250, 500).forEach { ml ->
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                val label = tr("water.quickAdd", n(ml))
                FilledTonalButton(onClick = { add(ml) }, enabled = !day.isAfter(LocalDate.now()),
                    shape = RoundedCornerShape(16.dp), colors = ButtonDefaults.filledTonalButtonColors(
                        containerColor = wellnessTint(MedoraColors.WaterContainer), contentColor = wellnessAccent(MedoraColors.Water)),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp).semantics { contentDescription = label },
                    contentPadding = PaddingValues(horizontal = 6.dp)) {
                    Text("+${n(ml)}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                }
                Text(tr("unit.ml"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun MedicationScreen(
    data: HealthData,
    history: LocalDate,
    chooseDate: () -> Unit,
    openEditor: (Editor) -> Unit,
    requestDelete: (PendingDeletion) -> Unit,
    vm: HealthViewModel
) {
    val language = LocalLanguage.current
    val calendar = LocalCalendar.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Heading(tr("medication.title"), Modifier.weight(1f))
        Button(onClick = { openEditor(Editor("medication")) }) {
            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
            Text(tr("medication.new"))
        }
    }
    DaySelector(history, chooseDate, { }, showArrows = false)
    val doses = data.calendarDoses(history)
    val taken = doses.count { it.status == DoseStatus.TAKEN }
    if (doses.isNotEmpty()) Panel(color = wellnessTint(MedoraColors.PrimaryContainer), compact = true) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(tr("reports.summary", n(taken), n(doses.size)), style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                Text(tr("reports.taken"), style = MaterialTheme.typography.bodySmall)
            }
            ProgressRing(taken.toFloat() / doses.size, MedoraColors.Primary)
        }
    }
    if (doses.isEmpty()) Empty(tr("medication.historyEmpty"))
    doses.forEach { DoseCard(it, vm, actionable = !history.isAfter(LocalDate.now())) }
    Heading(tr("medication.plans"))
    if (data.medications.isEmpty()) Empty(tr("medication.empty"))
    data.medications.forEach { medication ->
        Panel {
            val switchDescription = "${tr("medication.active")}: ${medication.name}"
            val switchState = tr(if (medication.active) "common.enabled" else "common.disabled")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(medication.name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Switch(
                    checked = medication.active,
                    onCheckedChange = { active -> vm.change({ it.changeMedication(medication.copy(active = active), ZonedDateTime.now()) }) },
                    modifier = Modifier.semantics {
                        contentDescription = switchDescription
                        stateDescription = switchState
                    }
                )
            }
            Text(
                if (medication.active) tr("medication.active") else tr("medication.paused"),
                style = MaterialTheme.typography.labelMedium,
                color = if (medication.active) wellnessAccent(MedoraColors.Success) else MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (medication.instructions.isNotBlank()) Text(medication.instructions)
            Text(tr("medication.times") + ": " + medication.times.joinToString(" · ") { localizedNumber(it, language) })
            val schedule = if (medication.dates.isNotEmpty()) {
                medication.dates.sorted().joinToString(if (language == "fa") "، " else ", ") { date -> CalendarSupport.formatDate(LocalDate.parse(date), calendar, language) }
            } else if (medication.weekdays.size == 7) {
                tr("medication.everyDay")
            } else {
                CalendarSupport.weekdayOrder(language).filter { it in medication.weekdays }
                    .joinToString(if (language == "fa") "، " else ", ") { day -> localizedWeekday(day, language) }
            }
            Text(schedule, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(tr("medication.startDate") + ": " + displayDate(LocalDate.parse(medication.startDay)),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { openEditor(Editor("medication", medication = medication)) }) { Text(tr("common.edit")) }
                TextButton(onClick = {
                    requestDelete(PendingDeletion("medication.deleteConfirm") {
                        it.deleteMedication(medication.id, ZonedDateTime.now())
                    })
                }) { Text(tr("common.delete"), color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

@Composable
private fun AppointmentScreen(
    data: HealthData,
    openEditor: (Editor) -> Unit,
    requestDelete: (PendingDeletion) -> Unit,
    vm: HealthViewModel
) {
    var filter by rememberSaveable { mutableIntStateOf(0) }
    ChoiceStrip(listOf(tr("appointment.all"), tr("appointment.upcoming"), tr("appointment.past")), filter) { filter = it }
    PrimaryAction(tr("appointment.new"), { openEditor(Editor("appointment")) })
    val future = data.appointments.filter { !it.cancelled && !it.instant().isBefore(Instant.now()) }.sortedBy { it.instant() }
    val past = data.appointments.filter { it.cancelled || it.instant().isBefore(Instant.now()) }.sortedByDescending { it.instant() }
    val shown = when (filter) { 1 -> future; 2 -> past; else -> future + past }
    if (shown.isEmpty()) Empty(tr("appointment.empty"))
    shown.forEachIndexed { index, appointment ->
        if (index == 0 && appointment in future) Heading(tr("appointment.nearest"))
        if (filter != 2 && index == future.size && past.isNotEmpty()) Heading(tr("appointment.past"))
        AppointmentCard(
            appointment,
            edit = { openEditor(Editor("appointment", appointment = appointment)) },
            toggle = { vm.change({ it.appointments.replace(appointment.copy(cancelled = !appointment.cancelled)) }) },
            delete = {
                requestDelete(PendingDeletion("appointment.deleteConfirm") {
                    it.appointments.removeAll { existing -> existing.id == appointment.id }
                })
            },
            showDelete = true
        )
    }
}

@Composable
fun DoseCard(dose: Dose, vm: HealthViewModel, actionable: Boolean = true) {
    var menu by remember { mutableStateOf(false) }
    val statusKey = when (dose.status) {
        DoseStatus.PENDING -> "dose.pending"
        DoseStatus.TAKEN -> "dose.taken"
        DoseStatus.SNOOZED -> "dose.snoozed"
        DoseStatus.SKIPPED -> "dose.skipped"
    }
    val stateColor = when (dose.status) {
        DoseStatus.TAKEN -> wellnessAccent(MedoraColors.Success)
        DoseStatus.SKIPPED -> MaterialTheme.colorScheme.error
        DoseStatus.SNOOZED -> wellnessAccent(MedoraColors.Warning)
        DoseStatus.PENDING -> wellnessAccent(MedoraColors.Medication)
    }
    val needsAction = dose.status == DoseStatus.PENDING || dose.status == DoseStatus.SNOOZED
    Panel(color = if (needsAction) wellnessTint(MedoraColors.WarningContainer) else MaterialTheme.colorScheme.surface, compact = true) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CapsuleIcon()
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(dose.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(tr("dose.time", displayTime(dose.wall.substring(11))), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (actionable) Box {
                IconButton(onClick = { menu = true }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.MoreVert, contentDescription = tr("a11y.changeDoseStatus"))
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DoseStatus.entries.forEach { status ->
                        val key = when (status) {
                            DoseStatus.PENDING -> "dose.reset"
                            DoseStatus.TAKEN -> "dose.take"
                            DoseStatus.SNOOZED -> "dose.snooze"
                            DoseStatus.SKIPPED -> "dose.skip"
                        }
                        DropdownMenuItem(
                            text = { Text(tr(key)) },
                            onClick = {
                                vm.change({ it.mark(dose, status, Instant.now()) })
                                menu = false
                            }
                        )
                    }
                }
            }
        }
        Surface(color = stateColor.copy(alpha = .10f), shape = RoundedCornerShape(50)) {
                Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        when (dose.status) {
                            DoseStatus.TAKEN -> Icons.Default.CheckCircle
                            DoseStatus.SKIPPED -> Icons.Default.RemoveCircleOutline
                            DoseStatus.SNOOZED -> Icons.Default.Snooze
                            DoseStatus.PENDING -> Icons.Default.Schedule
                        },
                        contentDescription = null,
                        tint = stateColor,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(5.dp))
                    Text(tr(statusKey), color = stateColor, style = MaterialTheme.typography.labelMedium)
                }
            }
        if (dose.instructions.isNotBlank()) Text(dose.instructions, style = MaterialTheme.typography.bodyMedium)
        if (actionable && needsAction) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { vm.change({ it.mark(dose, DoseStatus.TAKEN, Instant.now()) }) },
                    enabled = !vm.busy,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)
                ) { Text(tr("dose.take")) }
                OutlinedButton(
                    onClick = { vm.change({ it.mark(dose, DoseStatus.SNOOZED, Instant.now()) }) },
                    enabled = !vm.busy,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)
                ) { Text(tr("dose.snooze")) }
            }
        }
        if (dose.status == DoseStatus.SNOOZED) {
            Text(
                tr("dose.until", displayTime(Instant.ofEpochMilli(dose.snoozeUntil).atZone(ZoneId.systemDefault()).toLocalTime().withSecond(0).withNano(0))),
                style = MaterialTheme.typography.bodySmall,
                color = MedoraColors.Warning
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AppointmentCard(
    appointment: Appointment,
    edit: () -> Unit,
    toggle: () -> Unit,
    delete: () -> Unit,
    showDelete: Boolean = true
) {
    val language = LocalLanguage.current
    val local = java.time.LocalDateTime.parse(appointment.wall)
    Panel(color = wellnessTint(MedoraColors.Warm), compact = true) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            WellnessIcon(Icons.Default.Event, MedoraColors.Appointment)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(appointment.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    "${displayDate(local.toLocalDate())} · ${displayTime(local.toLocalTime())}",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            if (appointment.cancelled) Text(tr("appointment.cancelled"), color = MedoraColors.Error, style = MaterialTheme.typography.labelMedium)
        }
        if (appointment.zone != ZoneId.systemDefault().id) {
            Text(tr("appointment.timeZoneLabel", appointment.zone), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (appointment.location.isNotBlank()) Text(tr("appointment.locationLabel", appointment.location))
        if (appointment.contact.isNotBlank()) Text(tr("appointment.contactLabel", appointment.contact))
        if (appointment.notes.isNotBlank()) Text(appointment.notes)
        if (appointment.offsets.isNotEmpty()) {
            val offsets = appointment.offsets.sortedDescending().joinToString(" · ") { localizedOffsetLabel(it, language) }
            Text(tr("appointment.reminderLabel", offsets), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = edit) { Text(tr("common.edit")) }
            TextButton(onClick = toggle) {
                Text(if (appointment.cancelled) tr("appointment.reactivate") else tr("appointment.cancel"))
            }
            if (showDelete) TextButton(onClick = delete) { Text(tr("common.delete"), color = MaterialTheme.colorScheme.error) }
        }
    }
}
