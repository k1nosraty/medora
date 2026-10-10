package ir.hamrah.health

import android.app.Application
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import java.time.*

class HealthViewModel(app:Application):AndroidViewModel(app) {
    var data by mutableStateOf<HealthData?>(null);private set
    var busy by mutableStateOf(false);private set
    var error by mutableStateOf<String?>(null);private set
    var enabled by mutableStateOf(false);private set
    var exact by mutableStateOf(false);private set
    var next by mutableStateOf<Reminder?>(null);private set
    private val handler=Handler(Looper.getMainLooper())
    private val repo=Repository.get(app)
    private val service=Reminders(app)
    init { refresh() }
    fun refresh()=change({})
    fun change(mutation:(HealthData)->Unit,onSaved:()->Unit={}) {
        if(busy)return
        busy=true;error=null
        Repository.executor.execute {
            try {
                val committed=repo.update(mutation)
                var scheduleError:String?=null
                val planned=try { service.rebuild(committed) } catch(_:Exception) {
                    scheduleError="اطلاعات ذخیره شد؛ زمان‌بندی یادآوری کامل نشد. تنظیمات اعلان را بررسی کنید.";emptyList()
                }
                handler.post {
                    data=committed;enabled=service.enabled();exact=service.exact();next=planned.firstOrNull { it.kind!="maintenance" }
                    error=scheduleError;busy=false;onSaved()
                }
            } catch(e:Exception) {
                handler.post { error="ذخیره یا خواندن اطلاعات انجام نشد؛ اطلاعات قبلی پاک نشده‌اند.";busy=false }
            }
        }
    }
}
