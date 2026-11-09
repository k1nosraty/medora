package ir.medora.health

import ir.medora.care.DoseSlot
import ir.medora.care.MedicationPhase
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
import javax.crypto.AEADBadTagException

class PortableBackupTest {
    private val password = "آسمان روشن🌙 ۲۰۲۶".toCharArray()

    @Test fun roundTripKeepsRecordsAndDropsDeviceReminderState() {
        val day = LocalDate.parse("2026-11-09")
        val stock = MedicationStock(balance = 500, threshold = 1000, trackedFrom = 0, alerted = true)
        val phase = MedicationPhase(day.toEpochDay().toInt(), null, 1, 1, listOf(DoseSlot(480, 500), DoseSlot(960, 1000)))
        val medicine = Medication(
            id = "med-1", name = "اطلاعات حساس", startDay = day.toString(),
            times = listOf("08:00", "16:00"), phases = listOf(phase), unit = "قرص", stock = stock
        )
        val recorded = Dose.of(medicine, day, "08:00", 500).copy(
            status = DoseStatus.TAKEN, updatedAt = 10, actualMilliUnits = 500, stockDebit = 500
        )
        val snoozed = Dose.of(medicine, day, "16:00", 1000).copy(status = DoseStatus.SNOOZED, snoozeUntil = 20)
        val data = HealthData(
            settings = Settings(consent = true, pauseUntil = 30, privateNotifications = true),
            water = mutableListOf(Water("water-1", 250, day.toString(), 40)),
            medications = mutableListOf(medicine),
            doses = mutableListOf(recorded, snoozed),
            appointments = mutableListOf(Appointment("visit-1", "Visit", "2026-11-10T14:30", "Asia/Tehran")),
            waterAcknowledged = mutableSetOf("water"),
            waterSnoozes = mutableMapOf("water" to 50L),
            handledActions = mutableListOf("action"),
            through = day.toString(),
            nextNotificationId = 2,
            notificationIds = mutableMapOf("action" to 1),
            reminderCheckpoint = 60,
            deliveredReminders = mutableMapOf("action" to 60L)
        )
        val encrypted = PortableBackup.encode(data, password)
        assertFalse(encrypted.toString(Charsets.UTF_8).contains(medicine.name))
        assertFalse(encrypted.contentEquals(PortableBackup.encode(data, password)))
        val restored = PortableBackup.read(encrypted.inputStream(), password)

        assertEquals(data.water, restored.water)
        assertEquals(listOf(medicine.copy(stock = stock.copy(alerted = false))), restored.medications)
        assertEquals(data.appointments, restored.appointments)
        assertEquals(listOf(recorded, snoozed.copy(status = DoseStatus.PENDING, snoozeUntil = 0)), restored.doses)
        assertEquals(data.settings.copy(consent = false, pauseUntil = 0), restored.settings)
        assertTrue(restored.waterAcknowledged.isEmpty())
        assertTrue(restored.waterSnoozes.isEmpty())
        assertTrue(restored.handledActions.isEmpty())
        assertTrue(restored.notificationIds.isEmpty())
        assertTrue(restored.deliveredReminders.isEmpty())
        assertEquals(1, restored.nextNotificationId)
        assertEquals(0L, restored.reminderCheckpoint)
        assertEquals("", restored.through)
        assertTrue(data.settings.consent)
    }

    @Test fun rejectsWrongPasswordAndTamperedOrUnsupportedFiles() {
        val encrypted = PortableBackup.encode(HealthData(), password)
        assertThrows(AEADBadTagException::class.java) {
            PortableBackup.read(encrypted.inputStream(), "wrong password".toCharArray())
        }
        val tampered = encrypted.copyOf().apply { this[lastIndex] = (last().toInt() xor 1).toByte() }
        assertThrows(AEADBadTagException::class.java) {
            PortableBackup.read(tampered.inputStream(), password)
        }
        val unsupported = encrypted.copyOf().apply { this[7] = 2 }
        assertThrows(IllegalArgumentException::class.java) {
            PortableBackup.read(unsupported.inputStream(), password)
        }
        assertThrows(IllegalArgumentException::class.java) {
            PortableBackup.read(encrypted.copyOf(20).inputStream(), password)
        }
    }

    @Test fun rejectsDuplicateIdentifiersBeforeRestore() {
        val entry = Water("duplicate", 250, "2026-11-09", 10)
        val data = HealthData(water = mutableListOf(entry, entry))
        val encrypted = PortableBackup.encode(data, password)
        assertThrows(IllegalArgumentException::class.java) {
            PortableBackup.read(encrypted.inputStream(), password)
        }
    }
}
