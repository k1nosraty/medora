package ir.medora.health

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import java.time.ZonedDateTime
import java.util.concurrent.Executors
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class Repository private constructor(private val context:Context) {
    private val stateFile=AtomicFile(File(context.filesDir,"health-v2.enc"))
    private val queueFile=AtomicFile(File(context.filesDir,"queue-v2.enc"))
    private fun key():SecretKey {
        val store=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing=store.getKey("medora-health-v2",null) as? SecretKey
        if(existing!=null)return existing
        // Never replace a missing key for an existing encrypted dataset.
        check(!stateFile.baseFile.exists() && !File(stateFile.baseFile.path+".bak").exists()) { "کلید اطلاعات موجود در دسترس نیست" }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("medora-health-v2",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    private fun read(file:AtomicFile):String? {
        val bytes=try { file.openRead().use { it.readBytes() } } catch(e:java.io.FileNotFoundException) { return null }
        return Encryption.open(bytes,key()).toString(Charsets.UTF_8)
    }
    private fun write(file:AtomicFile,text:String) {
        val encrypted=Encryption.seal(text.toByteArray(Charsets.UTF_8),key())
        val stream=file.startWrite()
        try { stream.write(encrypted);file.finishWrite(stream) }
        catch(e:Exception) { file.failWrite(stream);throw e }
    }
    fun read():HealthData = read(stateFile)?.let(Codec::decode) ?: HealthData()
    fun update(change:(HealthData)->Unit):HealthData {
        val d=read();d.materialize(ZonedDateTime.now());change(d);d.validate();write(stateFile,Codec.encode(d));return d
    }
    fun saveQueue(q:List<Reminder>)=write(queueFile,Codec.encodeQueue(q))
    fun queue():List<Reminder> = read(queueFile)?.let(Codec::decodeQueue) ?: emptyList()
    companion object {
        // All UI writes, receiver actions and queue changes use this executor.
        // Components stay in the default Android process.
        val executor=Executors.newSingleThreadExecutor()
        @Volatile private var singleton:Repository?=null
        fun get(context:Context):Repository = singleton ?: synchronized(this) {
            singleton ?: Repository(context.applicationContext).also { singleton=it }
        }
    }
}
