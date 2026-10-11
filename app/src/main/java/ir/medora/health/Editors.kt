package ir.medora.health

import android.app.TimePickerDialog
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.time.*

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun EditDialog(
    editor: Editor,
    vm: HealthViewModel,
    close: () -> Unit,
    onSaved: () -> Unit,
    requestPermission: () -> Unit,
    openNotifications: () -> Unit,
    openExact: () -> Unit
) {
    if (editor.kind == "settings") {
        SettingsDialog(vm, close, onSaved, requestPermission, openNotifications, openExact)
        return
    }
    val data = vm.data ?: return
    val context = LocalContext.current
    val language = LocalLanguage.current
    val calendar = LocalCalendar.current
    val initialTime = remember(editor) {
        when {
            editor.water != null -> editor.water.editTime(ZoneId.systemDefault())
            editor.appointment != null -> LocalDateTime.parse(editor.appointment.wall)
            else -> (editor.date?.let { LocalDate.parse(it).atTime(LocalTime.now()) }
                ?: LocalDateTime.now().plusDays(if (editor.kind == "appointment") 1 else 0)).withSecond(0).withNano(0)
        }
    }
    var dateTime by remember(editor) { mutableStateOf(initialTime) }
    var medicationStart by remember(editor) { mutableStateOf(editor.medication?.startDay ?: LocalDate.now().toString()) }
    var name by remember(editor) { mutableStateOf(editor.medication?.name ?: editor.appointment?.title ?: "") }
    var medicationIcon by remember(editor) { mutableStateOf(editor.medication?.icon ?: MedicationIcon.CAPSULE) }
    var medicationColor by remember(editor) { mutableStateOf(editor.medication?.color ?: MedicationColor.ORANGE) }
    var instructions by remember(editor) { mutableStateOf(editor.medication?.instructions ?: "") }
    var times by remember(editor) { mutableStateOf(editor.medication?.times?.takeIf { it.isNotEmpty() } ?: listOf("08:00")) }
    var dates by remember(editor, calendar, language) {
        mutableStateOf(editor.medication?.dates?.sorted()?.joinToString(", ") {
            CalendarSupport.inputDate(LocalDate.parse(it), calendar, language)
        } ?: "")
    }
    var specific by remember(editor) { mutableStateOf(editor.medication?.dates?.isNotEmpty() ?: false) }
    var weekdays by remember(editor) { mutableStateOf(editor.medication?.weekdays ?: (1..7).toSet()) }
    var amount by remember(editor) { mutableStateOf((editor.water?.ml ?: 250).toString()) }
    var zone by remember(editor) { mutableStateOf(editor.appointment?.zone ?: ZoneId.systemDefault().id) }
    var location by remember(editor) { mutableStateOf(editor.appointment?.location ?: "") }
    var contact by remember(editor) { mutableStateOf(editor.appointment?.contact ?: "") }
    var notes by remember(editor) { mutableStateOf(editor.appointment?.notes ?: "") }
    var offsets by remember(editor) { mutableStateOf(editor.appointment?.offsets?.filter { it > 0 }?.toSet() ?: setOf(60)) }
    var advancedSchedule by remember(editor) {
        mutableStateOf(editor.medication?.let {
            it.times.size > 1 || it.weekdays != (1..7).toSet() || it.dates.isNotEmpty() || it.startDay != LocalDate.now().toString()
        } ?: false)
    }
    var customWater by remember(editor) { mutableStateOf(editor.water != null) }
    var waterDetails by remember(editor) { mutableStateOf(editor.water != null || editor.date != null && editor.date != LocalDate.now().toString()) }
    var appointmentDetails by remember(editor) { mutableStateOf(editor.appointment != null) }
    var error by remember(editor) { mutableStateOf<String?>(null) }
    var datePickerTarget by remember { mutableStateOf<String?>(null) }
    var requestedTime by remember { mutableStateOf<LocalTime?>(null) }
    var requestedAction by remember { mutableStateOf<((Int,Int)->Unit)?>(null) }

    val title = when (editor.kind) {
        "water" -> if (editor.water == null) tr("form.waterNew") else tr("form.waterEdit")
        "medication" -> if (editor.medication == null) tr("form.medicationNew") else tr("form.medicationEdit")
        "appointment" -> if (editor.appointment == null) tr("form.appointmentNew") else tr("form.appointmentEdit")
        else -> tr("app.settings")
    }

    fun timePicker(onPicked: (Int,Int)->Unit,initial: LocalTime) {
        requestedTime=initial;requestedAction=onPicked
    }

    fun medicationTimePicker(index: Int? = null) {
        val initial = LocalTime.parse(if (index == null) times.last() else times[index])
        timePicker({ hour, minute ->
            val selected = LocalTime.of(hour, minute).toString()
            if (times.withIndex().any { it.index != index && it.value == selected }) {
                error = "medication.duplicateTime"
            } else {
                times = if (index == null) times + selected else times.mapIndexed { i, time -> if (i == index) selected else time }
                error = null
            }
        }, initial)
    }

    fun save() {
        if (vm.busy) return
        error = null
        try {
            val mutation: (HealthData) -> Unit = when (editor.kind) {
                "water" -> {
                    val ml = normalize(amount).toIntOrNull()
                    if (ml == null || ml !in 1..10000) {
                        error = "validation.waterAmount"
                        return
                    }
                    val whenAt = dateTime.atZone(ZoneId.systemDefault())
                    if ((editor.water == null || dateTime != editor.water.editTime(ZoneId.systemDefault())) &&
                        whenAt.toInstant().isAfter(Instant.now())) {
                        error = "validation.waterFuture"
                        return
                    }
                    val action: (HealthData) -> Unit = { current ->
                        if (editor.water == null) current.addWater(ml, whenAt)
                        else {
                            current.water.removeAll { it.id == editor.water.id }
                            current.water += editor.water.edited(ml, dateTime, ZoneId.systemDefault())
                        }
                    }
                    action
                }
                "medication" -> {
                    if (name.isBlank()) {
                        error = "validation.medicationName"
                        return
                    }
                    val parsedTimes = times.map { LocalTime.parse(normalize(it)).withSecond(0).withNano(0).toString() }.distinct().sorted()
                    if (parsedTimes.isEmpty() || parsedTimes.size > 12) {
                        error = "validation.tooManyTimes"
                        return
                    }
                    val parsedDates = if (specific) {
                        if (dates.isBlank()) emptySet() else normalize(dates).replace('،', ',').split(',')
                            .map { CalendarSupport.fromInput(it.trim(), calendar).toString() }.toSet()
                    } else emptySet()
                    if (specific && parsedDates.isEmpty() || !specific && weekdays.isEmpty()) {
                        error = "validation.schedule"
                        return
                    }
                    val med = Medication(
                        id = editor.medication?.id ?: id(),
                        name = name.trim(),
                        instructions = instructions.trim(),
                        startDay = if (editor.medication == null || advancedSchedule) medicationStart else editor.medication.startDay,
                        times = parsedTimes,
                        weekdays = if (specific) emptySet() else weekdays,
                        dates = parsedDates,
                        active = editor.medication?.active ?: true,
                        icon = medicationIcon, color = medicationColor
                    )
                    val action: (HealthData) -> Unit = { current -> current.changeMedication(med, ZonedDateTime.now()) }
                    action
                }
                "appointment" -> {
                    if (name.isBlank()) {
                        error = "validation.appointmentTitle"
                        return
                    }
                    val appointmentZone = try {
                        ZoneId.of(normalize(zone.trim()))
                    } catch (_: Exception) {
                        error = "validation.timeZone"
                        return
                    }
                    val appointment = Appointment(
                        id = editor.appointment?.id ?: id(),
                        title = name.trim(),
                        wall = dateTime.toString(),
                        zone = appointmentZone.id,
                        location = location.trim(),
                        contact = contact.trim(),
                        notes = notes.trim(),
                        offsets = offsets,
                        cancelled = editor.appointment?.cancelled ?: false
                    )
                    if (editor.appointment == null && !appointment.instant().isAfter(Instant.now())) {
                        error = "validation.appointmentFuture"
                        return
                    }
                    val action: (HealthData) -> Unit = { current -> current.appointments.replace(appointment) }
                    action
                }
                else -> {
                    error = "error.generic"
                    return
                }
            }
            vm.change(mutation, onSaved)
        } catch (_: NumberFormatException) {
            error = "error.number"
        } catch (_: DateTimeException) {
            error = "error.calendar"
        } catch (_: IllegalArgumentException) {
            error = "error.generic"
        }
    }

    ModalBottomSheet(onDismissRequest = { if (!vm.busy) close() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        modifier=Modifier.testTag("editor-${editor.kind}"),
        containerColor = MaterialTheme.colorScheme.background,
        shape = RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp)) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.background,
            modifier = Modifier.widthIn(max = 560.dp).fillMaxWidth().align(Alignment.CenterHorizontally)
        ) {
            Column(
                Modifier.fillMaxWidth().heightIn(
                    max = (LocalContext.current.resources.displayMetrics.heightPixels /
                        LocalContext.current.resources.displayMetrics.density * .88f).dp
                ).imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                MedoraHeader(title,onClose={if(!vm.busy) close()})
                when (editor.kind) {
                    "water" -> {
                        FlowRow(maxItemsInEachRow = 3, horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf(150,250,500).forEach { ml ->
                                FilterChip(selected = normalize(amount) == ml.toString() && !customWater,
                                    onClick = { amount = ml.toString(); customWater = false },
                                    modifier = Modifier.heightIn(min = 48.dp),
                                    label = { Text(n(ml)) })
                            }
                            FilterChip(selected = customWater, onClick = { customWater = true },
                                modifier = Modifier.heightIn(min = 48.dp), label = { Text(tr("water.customAmount")) })
                        }
                        if (customWater) Input(amount, { amount = normalize(it);error=null }, tr("water.amountField"), keyboardType = KeyboardType.Number,error=if(error=="validation.waterAmount") tr(error!!) else null)
                        else Text(tr("water.ml", n(normalize(amount))), style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { waterDetails = !waterDetails }) { Text(tr("water.more")) }
                        if (waterDetails) {
                            OutlinedButton(onClick = { datePickerTarget = "date" }, modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)) {
                                Text(CalendarSupport.formatDate(dateTime.toLocalDate(), calendar, language, includeWeekday = true))
                            }
                            TimeField(tr("medication.time"), dateTime.toLocalTime()) { hour, minute ->
                                dateTime = dateTime.toLocalDate().atTime(hour, minute)
                            }
                        }
                    }
                    "medication" -> {
                        Input(name, { name = it;error=null }, tr("medication.name"), required = true,error=if(error=="validation.medicationName") tr(error!!) else null)
                        Input(instructions, { instructions = it }, tr("medication.instructions"), singleLine = false)
                        MedicationAppearancePicker(medicationIcon, medicationColor, { medicationIcon = it }, { medicationColor = it })
                        Text(tr("medication.time"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        times.take(if (advancedSchedule) times.size else 1).forEachIndexed { index, time ->
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                OutlinedButton(
                                    onClick = { medicationTimePicker(index) },
                                    modifier = Modifier.weight(1f).heightIn(min = 50.dp)
                                ) {
                                    Text(tr("medication.timeNumber", n(index + 1), displayTime(time)))
                                }
                                if (times.size > 1 && advancedSchedule) {
                                    IconButton(onClick = {
                                        times = times.filterIndexed { i, _ -> i != index }
                                        error = null
                                    }, modifier = Modifier.size(48.dp)) {
                                        Icon(Icons.Default.DeleteOutline, contentDescription = tr("a11y.deleteDoseTime", n(index + 1)))
                                    }
                                }
                            }
                        }
                        if (!advancedSchedule) {
                            Text(tr("medication.everyDay"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            TextButton(onClick = { advancedSchedule = true }) {
                                Icon(Icons.Default.ExpandMore, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text(tr("medication.advanced"))
                            }
                        } else {
                            TextButton(onClick = { medicationTimePicker() }, enabled = times.size < 12) {
                                Icon(Icons.Default.Add, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text(tr("medication.addTime"))
                            }
                            HorizontalDivider()
                            Text(tr("medication.schedule"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            OutlinedButton(onClick = { datePickerTarget = "start" }, modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)) {
                                Text(tr("medication.startDate") + ": " + CalendarSupport.formatDate(LocalDate.parse(medicationStart), calendar, language))
                            }
                            SwitchRow(tr("medication.specificDates"), specific) { specific = it }
                            if (specific) {
                                val helper = tr(if (calendar == "jalali") "medication.dateExampleSolar" else "medication.dateExampleGregorian")
                                Input(dates, { dates = it }, tr("medication.dateList"), helper, singleLine = false)
                            } else {
                                Text(tr("medication.weekdays"), style = MaterialTheme.typography.bodyMedium)
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    CalendarSupport.weekdayOrder(language).forEach { day ->
                                        FilterChip(
                                            selected = day in weekdays,
                                            onClick = { weekdays = if (day in weekdays) weekdays - day else weekdays + day },
                                            label = { Text(weekdayName(day)) }
                                        )
                                    }
                                }
                            }
                            TextButton(onClick = { advancedSchedule = false }) {
                                Icon(Icons.Default.ExpandLess, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text(tr("common.close"))
                            }
                        }
                        Text(tr("medication.disclaimer"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    "appointment" -> {
                        Input(name, { name = it;error=null }, tr("appointment.doctor"), required = true,error=if(error=="validation.appointmentTitle") tr(error!!) else null)
                        OutlinedButton(onClick = { datePickerTarget = "date" }, modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)) {
                            Text(CalendarSupport.formatDate(dateTime.toLocalDate(), calendar, language, includeWeekday = true))
                        }
                        TimeField(tr("medication.time"), dateTime.toLocalTime()) { hour, minute ->
                            dateTime = dateTime.toLocalDate().atTime(hour, minute)
                        }
                        Input(location, { location = it }, tr("appointment.location"))
                        TextButton(onClick = { appointmentDetails = !appointmentDetails }) { Text(tr("water.more")) }
                        if (appointmentDetails) {
                            Input(zone, { zone = it }, tr("appointment.timeZone"), tr("appointment.timeZoneHelp"))
                            Input(contact, { contact = it }, tr("appointment.contact"))
                            Input(notes, { notes = it }, tr("appointment.notes"), singleLine = false)
                        }
                        Text(
                            tr("appointment.reminderSummary", displayTime(data.settings.appointmentStart), n(data.settings.appointmentInterval / 60)),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(tr("appointment.earlyReminders"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf(60, 120, 1440).forEach { minutes ->
                                val key = when (minutes) {
                                    60 -> "appointment.oneHourBefore"
                                    120 -> "appointment.twoHoursBefore"
                                    else -> "appointment.dayBefore"
                                }
                                FilterChip(
                                    selected = minutes in offsets,
                                    onClick = { offsets = if (minutes in offsets) offsets - minutes else offsets + minutes },
                                    label = { Text(tr(key)) }
                                )
                            }
                        }
                    }
                }
                (error ?: vm.error)?.let { Text(tr(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Button(onClick = ::save, enabled = !vm.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)) {
                    if(vm.busy) {CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp);Spacer(Modifier.width(8.dp))}
                    Text(if (vm.busy) tr("common.saving") else tr("common.save"))
                }
                TextButton(onClick = close, enabled = !vm.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(tr("common.cancel"))
                }
            }
        }
    }

    requestedTime?.let { initial ->
        MedoraTimePicker(initial,{requestedTime=null},{hour,minute -> requestedAction?.invoke(hour,minute);requestedTime=null})
    }

    datePickerTarget?.let { target ->
        val currentDate = if (target == "start") LocalDate.parse(medicationStart) else dateTime.toLocalDate()
        CalendarDatePickerDialog(
            selectedDate = currentDate,
            calendar = calendar,
            language = language,
            maximumDate = if (editor.kind == "water") LocalDate.now() else null,
            onDismiss = { datePickerTarget = null },
            onSelect = { selected ->
                if (target == "start") medicationStart = selected.toString()
                else dateTime = selected.atTime(dateTime.toLocalTime())
                datePickerTarget = null
            }
        )
    }
}

@Composable
private fun TimeField(label: String, value: LocalTime, onPicked: (Int, Int) -> Unit) {
    var picker by remember {mutableStateOf(false)}
    OutlinedButton(onClick={picker=true},modifier=Modifier.fillMaxWidth().heightIn(min=50.dp)) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
            Text(label,Modifier.weight(1f),style=MaterialTheme.typography.labelLarge)
            Text(displayTime(value),style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
        }
    }
    if(picker) MedoraTimePicker(value,{picker=false},{hour,minute -> onPicked(hour,minute);picker=false})
}

@Composable
fun Input(
    value: String,
    change: (String) -> Unit,
    label: String,
    helper: String = "",
    singleLine: Boolean = true,
    required: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    error: String? = null
) {
    val displayedLabel = if (required) "$label · ${tr("common.required")}" else label
    OutlinedTextField(
        value = if (keyboardType == KeyboardType.Number) localizedNumber(value, LocalLanguage.current) else value,
        onValueChange = change,
        shape = RoundedCornerShape(16.dp),
        isError=error!=null,
        colors=OutlinedTextFieldDefaults.colors(
            focusedContainerColor=MaterialTheme.colorScheme.surfaceVariant,unfocusedContainerColor=MaterialTheme.colorScheme.surfaceVariant),
        singleLine = singleLine,
        minLines = if (singleLine) 1 else 2,
        label = { Text(displayedLabel) },
        supportingText = if (error!=null) ({Text(error)}) else if (helper.isBlank()) null else ({ Text(helper) }),
        keyboardOptions = KeyboardOptions(
            keyboardType = keyboardType,
            imeAction = if (singleLine) ImeAction.Next else ImeAction.Default
        ),
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
fun SwitchRow(label: String, checked: Boolean, change: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        val stateText = tr(if (checked) "common.enabled" else "common.disabled")
        Switch(
            checked = checked,
            onCheckedChange = change,
            modifier = Modifier.semantics {
                contentDescription = label
                stateDescription = stateText
            }
        )
    }
}

@Composable
private fun weekdayName(day: Int): String = when (day) {
    1 -> tr("weekday.mon")
    2 -> tr("weekday.tue")
    3 -> tr("weekday.wed")
    4 -> tr("weekday.thu")
    5 -> tr("weekday.fri")
    6 -> tr("weekday.sat")
    else -> tr("weekday.sun")
}
