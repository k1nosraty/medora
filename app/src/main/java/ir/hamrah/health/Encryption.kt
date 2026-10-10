package ir.hamrah.health

import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// Pure JVM component; Android supplies a non-exportable Keystore key.
object Encryption {
    fun seal(plain:ByteArray,key:SecretKey):ByteArray {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE,key)
        val iv=cipher.iv
        require(iv.size==12)
        cipher.updateAAD(byteArrayOf(72,72,2))
        return ByteBuffer.allocate(13+plain.size+16).put(2).put(iv).put(cipher.doFinal(plain)).array()
    }
    fun open(bytes:ByteArray,key:SecretKey):ByteArray {
        require(bytes.size>=29 && bytes[0]==2.toByte()) { "فایل اطلاعات معتبر نیست" }
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE,key,GCMParameterSpec(128,bytes.copyOfRange(1,13)))
        cipher.updateAAD(byteArrayOf(72,72,2))
        return cipher.doFinal(bytes.copyOfRange(13,bytes.size))
    }
}
