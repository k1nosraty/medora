package ir.medora.health

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.security.SecureRandom
import java.time.LocalDate
import java.time.LocalDateTime
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

internal object PortableBackup {
    const val MIN_PASSWORD_LENGTH = 12
    const val MAX_PASSWORD_LENGTH = 128
    private const val MAX_BYTES = 16 * 1024 * 1024
    private const val SALT_BYTES = 16
    private const val NONCE_BYTES = 12
    private const val TAG_BITS = 128
    private val magic = "MEDORA\u0000\u0001".toByteArray(Charsets.US_ASCII)
    private val random = SecureRandom()

    // Version 1: magic | 16-byte salt | 12-byte nonce | GCM ciphertext and tag.
    // The header is AAD. The payload is UTF-8 schema JSON and the key uses
    // PBKDF2-HMAC-SHA256 (600,000 iterations, 256 bits).
    fun encode(data: HealthData, password: CharArray): ByteArray {
        require(password.size in MIN_PASSWORD_LENGTH..MAX_PASSWORD_LENGTH)
        val plain = Codec.encode(data.forTransfer()).encodeToByteArray()
        try {
            require(plain.size <= MAX_BYTES - magic.size - SALT_BYTES - NONCE_BYTES - TAG_BITS / 8)
            val salt = ByteArray(SALT_BYTES).also(random::nextBytes)
            val nonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
            val header = magic + salt + nonce
            return header + cipher(Cipher.ENCRYPT_MODE, password, salt, nonce, header).doFinal(plain)
        } finally {
            plain.fill(0)
        }
    }

    fun read(input: InputStream, password: CharArray): HealthData {
        require(password.size in 1..MAX_PASSWORD_LENGTH)
        val buffer = ByteArray(8192)
        val contents = ByteArrayOutputStream()
        while (true) {
            val read = input.read(buffer)
            if (read == -1) break
            require(contents.size() <= MAX_BYTES - read)
            contents.write(buffer, 0, read)
        }
        val bytes = contents.toByteArray()
        val nonceStart = magic.size + SALT_BYTES
        val headerSize = nonceStart + NONCE_BYTES
        require(bytes.size >= headerSize + TAG_BITS / 8 && bytes.copyOf(magic.size).contentEquals(magic))
        val salt = bytes.copyOfRange(magic.size, nonceStart)
        val nonce = bytes.copyOfRange(nonceStart, headerSize)
        val plain = cipher(Cipher.DECRYPT_MODE, password, salt, nonce, bytes.copyOf(headerSize))
            .doFinal(bytes, headerSize, bytes.size - headerSize)
        try {
            val data = Codec.decode(plain.decodeToString(throwOnInvalidSequence = true))
            requireUniqueIds(data.water.map { it.id })
            requireUniqueIds(data.medications.map { it.id })
            requireUniqueIds(data.doses.map { it.id })
            requireUniqueIds(data.appointments.map { it.id })
            data.water.forEach { LocalDate.parse(it.day) }
            data.doses.forEach {
                require(it.medicationId.isNotBlank())
                LocalDateTime.parse(it.wall)
            }
            return data.forTransfer()
        } finally {
            plain.fill(0)
        }
    }

    private fun requireUniqueIds(ids: List<String>) {
        require(ids.none { it.isBlank() } && ids.toSet().size == ids.size)
    }

    private fun HealthData.forTransfer() = copy(
        settings = settings.copy(consent = false, pauseUntil = 0),
        medications = medications.map { medication ->
            val stock = medication.stock
            if (stock?.alerted == true) medication.copy(stock = stock.copy(alerted = false)) else medication
        }.toMutableList(),
        doses = doses.map { dose ->
            if (dose.status == DoseStatus.SNOOZED) dose.copy(status = DoseStatus.PENDING, snoozeUntil = 0) else dose
        }.toMutableList(),
        waterAcknowledged = mutableSetOf(),
        waterSnoozes = mutableMapOf(),
        handledActions = mutableListOf(),
        through = "",
        nextNotificationId = 1,
        notificationIds = mutableMapOf(),
        reminderCheckpoint = 0,
        deliveredReminders = mutableMapOf()
    )

    private fun cipher(mode: Int, password: CharArray, salt: ByteArray, nonce: ByteArray, header: ByteArray): Cipher {
        val spec = PBEKeySpec(password, salt, 600_000, 256)
        val key = try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
        return try {
            Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, nonce))
                updateAAD(header)
            }
        } finally {
            key.fill(0)
        }
    }
}
