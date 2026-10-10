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
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
                MaterialTheme(colorScheme = medoraColorScheme(), typography = medoraTypography(language)) {
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

data class Editor(val kind: String, val water: Water? = null, val medication: Medication? = null, val appointment: Appointment? = null)
private data class PendingDeletion(val messageKey: String, val mutation: (HealthData) -> Unit)

@Composable
fun Panel(
    color: Color = MaterialTheme.colorScheme.surface,
    compact: Boolean = false,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = color,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            Modifier.padding(if (compact) 14.dp else 18.dp),
            verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 10.dp),
            content = content
        )
    }
}

@Composable
fun Heading(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = modifier)
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
    val historyDate = LocalDate.parse(history)
    val tabs = listOf(
        Triple("nav.today", Icons.Default.Dashboard, "nav.today"),
        Triple("nav.water", Icons.Default.WaterDrop, "nav.water"),
        Triple("nav.medications", Icons.Default.Medication, "nav.medications"),
        Triple("nav.appointments", Icons.Default.CalendarMonth, "nav.appointments")
    )

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Image(painterResource(R.drawable.ic_brand), contentDescription = null, modifier = Modifier.size(28.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Medora", fontWeight = FontWeight.Bold)
                    }
                },
                actions = {
                    IconButton(onClick = { editor = Editor("settings") }, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Default.Tune, contentDescription = tr("a11y.settings"))
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
                tonalElevation = 0.dp
            ) {
                tabs.forEachIndexed { index, (key, icon, descriptionKey) ->
                    NavigationBarItem(
                        selected = tab == index,
                        onClick = { tab = index },
                        icon = { Icon(icon, contentDescription = tr(descriptionKey), modifier = Modifier.size(22.dp)) },
                        label = { Text(tr(key), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        alwaysShowLabel = true,
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.primary,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    )
                }
            }
        }
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            Column(
                Modifier.widthIn(max = 760.dp).fillMaxWidth().weight(1f)
                    .verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                vm.error?.let { ErrorNotice(tr(it)) }
                when (tab) {
                    0 -> TodayScreen(data, vm, requestPermission, openNotification) { editor = it }
                    1 -> WaterScreen(data, historyDate, { showHistoryPicker = true }, { editor = it }, { deletion = it }, vm)
                    2 -> MedicationScreen(data, historyDate, { showHistoryPicker = true }, { editor = it }, { deletion = it }, vm)
                    else -> AppointmentScreen(data, { editor = it }, { deletion = it }, vm)
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
    openEditor: (Editor) -> Unit
) {
    val today = LocalDate.now()
    val doses = data.dayDoses(today.toString())
    val taken = doses.count { it.status == DoseStatus.TAKEN }
    val activeDoses = doses.sortedWith(
        compareBy<Dose> { if (it.status == DoseStatus.TAKEN || it.status == DoseStatus.SKIPPED) 1 else 0 }
            .thenBy { it.wall }
    )
    val nextAppointment = data.appointments
        .filter { !it.cancelled && it.instant().isAfter(Instant.now()) }
        .minByOrNull { it.instant() }

    if (!data.settings.consent || !vm.enabled) {
        Panel(color = MedoraColors.WarningContainer, compact = true) {
            Text(tr("permission.title"), fontWeight = FontWeight.SemiBold, color = MedoraColors.Warning)
            Text(tr("permission.body"), style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = requestPermission, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                    Text(tr("permission.enable"))
                }
                TextButton(onClick = openNotification) { Text(tr("permission.phoneSettings")) }
            }
        }
    }

    Text(displayDate(today, includeWeekday = true), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
    Text(tr("today.title"), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)

    Panel(color = MedoraColors.WaterContainer, compact = true) {
        Text(tr("today.waterCompact"), fontWeight = FontWeight.SemiBold, color = MedoraColors.Water)
        Text(
            tr("water.progress", n(data.total(today.toString())), n(data.settings.goal)),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )
        LinearProgressIndicator(
            progress = { data.progress(today.toString()) },
            modifier = Modifier.fillMaxWidth(),
            color = MedoraColors.Water
        )
        Text(
            if (data.remaining(today.toString()) == 0) tr("water.goalReached")
            else tr("water.remaining", n(data.remaining(today.toString()))),
            style = MaterialTheme.typography.bodySmall
        )
    }
    Panel(color = MedoraColors.PrimaryContainer, compact = true) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(tr("today.medicationCompact"), fontWeight = FontWeight.SemiBold, color = MedoraColors.OnPrimaryContainer)
                Text(
                    if (doses.isEmpty()) tr("today.noMedication")
                    else tr("today.progress", n(taken), n(doses.size)),
                    color = MedoraColors.OnPrimaryContainer
                )
            }
            if (doses.isNotEmpty()) {
                CircularProgressIndicator(
                    progress = { taken.toFloat() / doses.size },
                    modifier = Modifier.size(42.dp),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surface.copy(alpha = .65f),
                    strokeWidth = 4.dp
                )
            }
        }
    }

    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Heading(tr("today.schedule"), Modifier.weight(1f))
        if (activeDoses.isNotEmpty()) {
            TextButton(onClick = { openEditor(Editor("medication")) }) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text(tr("today.addMedicine"))
            }
        }
    }
    if (activeDoses.isEmpty()) {
        Empty(tr("today.noMedication")) {
            Button(onClick = { openEditor(Editor("medication")) }) { Text(tr("today.addMedicine")) }
        }
    } else {
        activeDoses.forEach { DoseCard(it, vm) }
        if (taken == doses.size && doses.isNotEmpty()) {
            Text(tr("today.allDone"), color = MedoraColors.Success, style = MaterialTheme.typography.bodyMedium)
        }
    }

    if (nextAppointment != null) {
        Heading(tr("today.upcomingAppointment"))
        AppointmentCard(
            nextAppointment,
            edit = { openEditor(Editor("appointment", appointment = nextAppointment)) },
            toggle = { vm.change({ it.appointments.replace(nextAppointment.copy(cancelled = !nextAppointment.cancelled)) }) },
            delete = { },
            showDelete = false
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { openEditor(Editor("water")) }, modifier = Modifier.weight(1f)) {
            Icon(Icons.Default.WaterDrop, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(tr("today.waterAction"), maxLines = 1)
        }
        OutlinedButton(onClick = { openEditor(Editor("appointment")) }, modifier = Modifier.weight(1f)) {
            Icon(Icons.Default.Event, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(tr("today.appointmentAction"), maxLines = 1)
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
    Heading(tr("water.history"))
    OutlinedButton(onClick = chooseDate, modifier = Modifier.heightIn(min = 48.dp)) {
        Icon(Icons.Default.History, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(displayDate(day))
    }
    WaterSummary(data, day) { ml ->
        vm.change({ it.addWater(ml, ZonedDateTime.of(day, LocalTime.now(), ZoneId.systemDefault())) })
    }
    Button(onClick = { openEditor(Editor("water")) }) { Text(tr("water.custom")) }
    val entries = data.water.filter { it.day == day.toString() }.sortedByDescending { it.at }
    if (entries.isEmpty()) Empty(tr("water.empty"))
    entries.forEach { entry ->
        Panel(compact = true) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.WaterDrop, contentDescription = null, tint = MedoraColors.Water)
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
    Panel(color = MedoraColors.WaterContainer, compact = true) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(tr("water.title"), fontWeight = FontWeight.SemiBold)
            Text(tr("water.percent", n((data.progress(day.toString()) * 100).toInt())), color = MedoraColors.Water, fontWeight = FontWeight.SemiBold)
        }
        Text(
            tr("water.progress", n(data.total(day.toString())), n(data.settings.goal)),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )
        LinearProgressIndicator(
            progress = { data.progress(day.toString()) },
            modifier = Modifier.fillMaxWidth(),
            color = MedoraColors.Water
        )
        Text(
            if (data.remaining(day.toString()) == 0) tr("water.goalReached")
            else tr("water.remaining", n(data.remaining(day.toString()))),
            style = MaterialTheme.typography.bodySmall
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(150, 250, 500).forEach { ml ->
                val label = tr("water.quickAdd", n(ml))
                FilledTonalButton(
                    onClick = { add(ml) },
                    modifier = Modifier.weight(1f).semantics { contentDescription = label },
                    contentPadding = PaddingValues(horizontal = 6.dp)
                ) {
                    Text(tr("water.ml", "+${n(ml)}"))
                }
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
                color = if (medication.active) MedoraColors.Success else MaterialTheme.colorScheme.onSurfaceVariant
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
    Heading(tr("medication.status"))
    OutlinedButton(onClick = chooseDate, modifier = Modifier.heightIn(min = 48.dp)) { Text(displayDate(history)) }
    val doses = data.dayDoses(history.toString())
    if (doses.isEmpty()) Empty(tr("medication.historyEmpty"))
    doses.forEach { DoseCard(it, vm) }
}

@Composable
private fun AppointmentScreen(
    data: HealthData,
    openEditor: (Editor) -> Unit,
    requestDelete: (PendingDeletion) -> Unit,
    vm: HealthViewModel
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Heading(tr("appointment.title"), Modifier.weight(1f))
        Button(onClick = { openEditor(Editor("appointment")) }) {
            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
            Text(tr("appointment.new"))
        }
    }
    val future = data.appointments.filter { !it.cancelled && !it.instant().isBefore(Instant.now()) }.sortedBy { it.instant() }
    val past = data.appointments.filter { it.cancelled || it.instant().isBefore(Instant.now()) }.sortedByDescending { it.instant() }
    if (future.isEmpty()) Empty(tr("appointment.empty"))
    (future + past).forEachIndexed { index, appointment ->
        if (index == future.size && past.isNotEmpty()) Heading(tr("appointment.past"))
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
fun DoseCard(dose: Dose, vm: HealthViewModel) {
    var menu by remember { mutableStateOf(false) }
    val statusKey = when (dose.status) {
        DoseStatus.PENDING -> "dose.pending"
        DoseStatus.TAKEN -> "dose.taken"
        DoseStatus.SNOOZED -> "dose.snoozed"
        DoseStatus.SKIPPED -> "dose.skipped"
    }
    val stateColor = when (dose.status) {
        DoseStatus.TAKEN -> MedoraColors.Success
        DoseStatus.SKIPPED -> MedoraColors.Error
        DoseStatus.SNOOZED -> MedoraColors.Warning
        DoseStatus.PENDING -> MaterialTheme.colorScheme.primary
    }
    Panel(compact = true) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(dose.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(tr("dose.time", displayTime(dose.wall.substring(11))), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
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
            Box {
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
        if (dose.instructions.isNotBlank()) Text(dose.instructions, style = MaterialTheme.typography.bodyMedium)
        if (dose.status == DoseStatus.PENDING || dose.status == DoseStatus.SNOOZED) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { vm.change({ it.mark(dose, DoseStatus.TAKEN, Instant.now()) }) },
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)
                ) { Text(tr("dose.take"), maxLines = 1) }
                OutlinedButton(
                    onClick = { vm.change({ it.mark(dose, DoseStatus.SNOOZED, Instant.now()) }) },
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)
                ) { Text(tr("dose.snooze"), maxLines = 1) }
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
    Panel(compact = true) {
        Row(verticalAlignment = Alignment.Top) {
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
