package ir.medora.health

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import ir.medora.care.DoseSlot
import ir.medora.care.MedicationPhase
import ir.medora.care.formatQuantity
import ir.medora.care.parseQuantity
import ir.medora.care.validatePhases
import java.time.*

internal data class PhaseSlotDraft(val time:String="08:00",val amount:String="",val key:String=id())

internal data class PhaseDraft(
    val key: String = id(),
    val start: String,
    val end: String = "",
    val weeks: String = "1",
    val days: Int = 127,
    val slots: List<PhaseSlotDraft> = listOf(PhaseSlotDraft())
) {
    fun toPhase(calendar: String): MedicationPhase {
        return MedicationPhase(
            CalendarSupport.fromInput(start, calendar).toEpochDay().toInt(),
            end.takeIf { it.isNotBlank() }?.let { CalendarSupport.fromInput(it, calendar).plusDays(1).toEpochDay().toInt() },
            requireNotNull(normalize(weeks).trim().toIntOrNull()), days,
            slots.map { slot ->
                val time = LocalTime.parse(normalize(slot.time).trim())
                val quantity = if(slot.amount.isBlank()) null else requireNotNull(parseQuantity(slot.amount)).also { require(it>0) }
                DoseSlot(time.hour * 60 + time.minute, quantity)
            }.sortedBy { it.minuteOfDay }
        )
    }

    companion object {
        fun fromPhase(phase: MedicationPhase, calendar: String, language: String) = PhaseDraft(
            start = CalendarSupport.inputDate(LocalDate.ofEpochDay(phase.startDay.toLong()), calendar, language),
            end = phase.endBeforeDay?.let { CalendarSupport.inputDate(LocalDate.ofEpochDay(it.toLong() - 1), calendar, language) }.orEmpty(),
            weeks = phase.intervalWeeks.toString(), days = phase.weekdayMask,
            slots = phase.slots.map { slot -> PhaseSlotDraft(
                LocalTime.of(slot.minuteOfDay / 60, slot.minuteOfDay % 60).toString(),
                slot.milliUnits?.let(::formatQuantity).orEmpty()
            ) }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun MedicationPhaseFields(drafts: List<PhaseDraft>, update: (List<PhaseDraft>) -> Unit) {
    val calendar = LocalCalendar.current
    val language = LocalLanguage.current
    val today = LocalDate.now()
    val dateHint = CalendarSupport.inputDate(today, calendar, language)
    drafts.forEachIndexed { index, phase -> key(phase.key) {
        fun edit(updated: PhaseDraft) = update(drafts.map { if (it.key == updated.key) updated else it })
        HorizontalDivider()
        Text(tr("care.phaseNumber", n(index + 1)), style = MaterialTheme.typography.titleMedium)
        Input(phase.start, { edit(phase.copy(start = it)) }, tr("medication.startDate"), dateHint)
        Input(phase.end, { edit(phase.copy(end = it)) }, tr("care.phaseEnd"), dateHint)
        Input(phase.weeks, { edit(phase.copy(weeks = it)) }, tr("care.phaseWeeks"), keyboardType = KeyboardType.Number)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            CalendarSupport.weekdayOrder(language).forEach { day ->
                val flag = 1 shl (day - 1)
                FilterChip(selected = phase.days and flag != 0, onClick = { edit(phase.copy(days = phase.days xor flag)) },
                    label = { Text(localizedWeekday(day, language)) })
            }
        }
        phase.slots.forEach { slot -> key(slot.key) {
            fun editSlot(updated:PhaseSlotDraft) = edit(phase.copy(slots=phase.slots.map { if(it.key==slot.key) updated else it }))
            Input(slot.time, { editSlot(slot.copy(time=it)) }, tr("medication.time"), "08:00")
            Input(slot.amount, { editSlot(slot.copy(amount=it)) }, tr("care.amount"), keyboardType = KeyboardType.Decimal)
            if(phase.slots.size>1) TextButton(onClick={ edit(phase.copy(slots=phase.slots.filterNot { it.key==slot.key })) }) {
                Text(tr("care.removeSlot"))
            }
        } }
        TextButton(onClick={ edit(phase.copy(slots=phase.slots+PhaseSlotDraft(time=""))) },enabled=phase.slots.size<12) {
            Text(tr("medication.addTime"))
        }
        if (drafts.size > 1) TextButton(onClick = { update(drafts.filterNot { it.key == phase.key }) }) {
            Text(tr("care.removePhase"))
        }
    } }
    TextButton(onClick = {
        val last = drafts.last()
        val next = runCatching { CalendarSupport.fromInput(last.end, calendar).plusDays(1) }.getOrDefault(today)
        update(drafts + PhaseDraft(start = CalendarSupport.inputDate(next, calendar, language), slots = last.slots))
    }, enabled = drafts.size < 50) { Text(tr("care.addPhase")) }

    val preview = remember(drafts, calendar, today) {
        runCatching {
            val phases = drafts.map { it.toPhase(calendar) }.also(::validatePhases)
            val now = LocalDateTime.now()
            phases.asSequence().flatMap { phase ->
                val first = maxOf(today.toEpochDay(), phase.startDay.toLong())
                val last = minOf(first + 6 * 364, phase.endBeforeDay?.toLong()?.minus(1) ?: Long.MAX_VALUE)
                (first..last).asSequence().filter { phase.occurs(it.toInt()) }.flatMap { day ->
                    phase.slots.asSequence().map { slot ->
                        val time = LocalTime.of(slot.minuteOfDay / 60, slot.minuteOfDay % 60)
                        LocalDate.ofEpochDay(day).atTime(time) to slot.milliUnits
                    }
                }
            }.filter { it.first >= now }.take(5).toList()
        }.getOrNull()
    }
    if (preview != null) {
        Text(tr("care.preview"), style = MaterialTheme.typography.titleSmall)
        if (preview.isEmpty()) Text(tr("care.noUpcoming"))
        preview.forEach { (whenAt, amount) ->
            Text(listOfNotNull(displayDate(whenAt.toLocalDate()), displayTime(whenAt.toLocalTime()),
                amount?.let { localizedNumber(formatQuantity(it), language) }).joinToString(" · "))
        }
    }
}

@Composable
internal fun MedicationStockSummary(medication: Medication, vm: HealthViewModel) {
    val stock = medication.stock ?: return
    var open by remember { mutableStateOf(false) }
    val language = LocalLanguage.current
    val low = vm.data?.lowStock(medication,ZonedDateTime.now()) ?: stock.low
    Text(tr("care.remaining", localizedNumber(formatQuantity(stock.balance), language), medication.unit),
        color = if (low) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
    if (low) Text(tr("care.low"), color = MaterialTheme.colorScheme.error)
    TextButton(onClick = { open = true }, enabled = !vm.busy) { Text(tr("care.bought")) }
    if (open) QuantityDialog("care.bought", medication.unit, "", vm, { open = false }) { amount ->
        vm.change({ it.addStock(medication.id, amount) }) { open = false }
    }
}

@Composable
internal fun QuantityDialog(title: String, unit: String, initial: String, vm: HealthViewModel, dismiss: () -> Unit, save: (Int) -> Unit) {
    var text by remember { mutableStateOf(initial) }
    val quantity = parseQuantity(text)?.takeIf { it > 0 }
    AlertDialog(onDismissRequest = { if (!vm.busy) dismiss() }, title = { Text(tr(title)) }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Input(text, { text = it }, if (unit.isBlank()) tr("care.amount") else unit, keyboardType = KeyboardType.Decimal)
            if (text.isNotBlank() && quantity == null) Text(tr("care.invalidAmount"), color = MaterialTheme.colorScheme.error)
            vm.error?.let { Text(tr(it), color = MaterialTheme.colorScheme.error) }
        }
    }, confirmButton = {
        Button(onClick = { quantity?.let(save) }, enabled = quantity != null && !vm.busy) { Text(tr("common.save")) }
    }, dismissButton = {
        TextButton(onClick = dismiss, enabled = !vm.busy) { Text(tr("common.cancel")) }
    })
}
