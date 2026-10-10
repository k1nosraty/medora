package ir.medora.health

import java.util.concurrent.Executor

/** Called from the UI thread; work is serialized by the supplied executor. */
class SerialWorkQueue(private val executor:Executor,private val post:((()->Unit)->Unit)) {
    var pending:Int=0;private set
    fun <T> submit(work:()->T,complete:(Result<T>)->Unit) {
        pending++
        executor.execute {
            val result=runCatching(work)
            post { pending--;complete(result) }
        }
    }
}
