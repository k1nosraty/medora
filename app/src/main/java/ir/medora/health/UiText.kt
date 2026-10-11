package ir.medora.health

import android.content.Context
import android.view.ContextThemeWrapper
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import java.util.Locale

/** The current app language and display calendar, supplied by the persisted settings. */
val LocalLanguage = staticCompositionLocalOf { "fa" }
val LocalCalendar = staticCompositionLocalOf { "jalali" }

private val copy = mapOf(
    "design.later" to ("فعلاً نه" to "Not now"),
    "medication.specificSummary" to ("برنامه برای {0} تاریخ مشخص" to "Scheduled on {0} specific dates"),
    "appointment.clinicTimeLabel" to ("زمان محل قرار: {0} · {1} ({2})" to "Clinic time: {0} · {1} ({2})"),
    "today.timeline" to ("برنامهٔ روز" to "Daily timeline"),
    "today.timelineEmpty" to ("برای این روز دارو یا قراری ثبت نشده." to "No medications or appointments scheduled for this day."),
    "design.theme" to ("ظاهر برنامه" to "Appearance"),
    "design.theme.system" to ("سیستم" to "System"),
    "design.theme.light" to ("روشن" to "Light"),
    "design.theme.dark" to ("تیره" to "Dark"),
    "design.intakeHistory" to ("سابقهٔ مصرف" to "Intake history"),
    "design.clockMode" to ("انتخاب با ساعت" to "Use clock"),
    "design.keyboardMode" to ("ورود عددی ساعت" to "Enter time"),
    "settings.medicationsTab" to ("دارو" to "Meds"),
    "settings.medicationSnooze" to ("مدت تعویق دارو" to "Medication snooze duration"),
    "settings.customSnooze" to ("زمان دلخواه" to "Custom"),
    "settings.snoozeMinutes" to ("مدت تعویق (دقیقه)" to "Snooze duration (minutes)"),
    "settings.snoozeNote" to ("برای تعویق دارو در برنامه و اعلان استفاده می‌شود." to "Used for medication snooze in the app and notifications."),
    "validation.medicationSnooze" to ("مدت تعویق باید بین ۱ تا ۱۴۴۰ دقیقه باشد." to "Enter a duration between 1 and 1440 minutes."),
    "settings.minutes" to ("{0} دقیقه" to "{0} min"),
    "schedule.futureReadOnly" to ("برنامهٔ آینده؛ ثبت مصرف فقط از روز موعد فعال می‌شود." to "Future schedule; dose actions become available on the scheduled day."),
    "schedule.medications" to ("داروهای این روز" to "Medication for this day"),
    "schedule.appointments" to ("قرارهای این روز" to "Appointments for this day"),
    "schedule.planned" to ("{0} نوبت برنامه‌ریزی‌شده" to "{0} planned doses"),

    "appearance.title" to ("ظاهر دارو (اختیاری)" to "Appearance (optional)"),
    "appearance.icon" to ("آیکون" to "Icon"),
    "appearance.color" to ("رنگ" to "Color"),
    "appearance.preview" to ("پیش‌نمایش نشان دارو" to "Medication badge preview"),
    "appearance.icon.tablet" to ("قرص" to "Tablet"),
    "appearance.icon.capsule" to ("کپسول" to "Capsule"),
    "appearance.icon.syrup" to ("شربت" to "Syrup"),
    "appearance.icon.ampoule" to ("آمپول" to "Ampoule"),
    "appearance.icon.ointment" to ("پماد" to "Ointment"),
    "appearance.icon.drops" to ("قطره" to "Drops"),
    "appearance.icon.spray" to ("اسپری" to "Spray"),
    "appearance.color.orange" to ("نارنجی" to "Orange"),
    "appearance.color.teal" to ("سبزآبی" to "Teal"),
    "appearance.color.blue" to ("آبی" to "Blue"),
    "appearance.color.lavender" to ("بنفش" to "Lavender"),
    "appearance.color.rose" to ("رز" to "Rose"),
    "appearance.color.slate" to ("خاکستری آبی" to "Slate"),

    "nav.settings.short" to ("تنظیمات" to "Settings"),
    "nav.medications.short" to ("داروها" to "Meds"),
    "nav.appointments.short" to ("قرارها" to "Visits"),
    "nav.insights" to ("گزارش و تقویم" to "Insights"),
    "nav.insights.short" to ("گزارش" to "Insights"),
    "water.history" to ("مشاهدهٔ سابقهٔ آب" to "View water history"),
    "welcome.tagline" to ("همراه سلامتی، هر روز" to "Your daily care companion"),
    "welcome.intro" to ("آب، دارو و قرارهای پزشکی؛ با خیال آسوده." to "Water, medications and appointments, with peace of mind."),
    "welcome.start" to ("شروع کنید" to "Get started"),
    "welcome.local" to ("اطلاعات شما روی همین گوشی می‌ماند." to "Your information stays on this phone."),
    "today.greeting" to ("سلام، روزتان بخیر" to "Hello, have a lovely day"),
    "today.viewAll" to ("مشاهده همه" to "View all"),
    "nav.calendar" to ("تقویم" to "Calendar"),
    "nav.reports" to ("گزارش‌ها" to "Reports"),
    "calendar.empty" to ("برای این روز فعالیتی ثبت نشده است." to "No activity recorded for this day."),
    "calendar.future" to ("برنامهٔ این روز" to "This day’s schedule"),
    "calendar.water" to ("آب ثبت‌شده" to "Water logged"),
    "water.consumption" to ("مصرف این روز" to "Water consumed"),
    "water.customAmount" to ("سفارشی" to "Custom"),
    "medication.plans" to ("برنامه‌های دارو" to "Medication schedules"),
    "medication.tomorrow" to ("فردا" to "Tomorrow"),
    "appointment.all" to ("همه" to "All"),
    "appointment.upcoming" to ("نزدیک" to "Upcoming"),
    "appointment.nearest" to ("نزدیک‌ترین قرار" to "Nearest appointment"),
    "reports.week" to ("هفته" to "Week"),
    "reports.month" to ("ماه" to "Month"),
    "reports.year" to ("سال" to "Year"),
    "reports.average" to ("میانگین روزانه" to "Daily average"),
    "reports.water" to ("مصرف آب" to "Water consumption"),
    "reports.doses" to ("پیگیری مصرف دارو" to "Medication tracking"),
    "reports.taken" to ("مصرف ثبت‌شده" to "Marked as taken"),
    "reports.summary" to ("{0} از {1} نوبت" to "{0} of {1} doses"),
    "reports.empty" to ("هنوز داده‌ای برای این بازه ندارید." to "No data in this period yet."),
    "reports.note" to ("نوبت‌های بدون ثبت، مصرف‌نشده محسوب نمی‌شوند." to "Unmarked doses are not counted as skipped."),
    "reports.range" to ("از {0} تا {1}" to "{0} to {1}"),
    "reports.total" to ("مجموع مصرف" to "Total consumed"),
    "reports.goalNote" to ("خط نقطه‌چین: هدف فعلی روزانه" to "Dotted line: current daily goal"),
    "calendar.legend" to ("آب · دارو · قرار" to "Water · Medication · Appointment"),
    "app.settings" to ("تنظیمات Medora" to "Medora settings"),
    "common.close" to ("بستن" to "Close"),
    "common.cancel" to ("انصراف" to "Cancel"),
    "common.save" to ("ذخیره" to "Save"),
    "common.saving" to ("در حال ذخیره…" to "Saving…"),
    "common.saveSettings" to ("ذخیره تنظیمات" to "Save settings"),
    "common.delete" to ("حذف" to "Delete"),
    "common.edit" to ("ویرایش" to "Edit"),
    "common.retry" to ("تلاش دوباره" to "Try again"),
    "common.add" to ("افزودن" to "Add"),
    "common.select" to ("انتخاب" to "Select"),
    "common.today" to ("امروز" to "Today"),
    "common.required" to ("الزامی" to "Required"),
    "common.enabled" to ("فعال" to "On"),
    "common.disabled" to ("خاموش" to "Off"),
    "feedback.saved" to ("با موفقیت ذخیره شد." to "Saved successfully."),
    "nav.today" to ("امروز" to "Today"),
    "nav.water" to ("آب" to "Water"),
    "nav.medications" to ("داروها" to "Medications"),
    "nav.appointments" to ("قرارها" to "Appointments"),
    "a11y.settings" to ("تنظیمات" to "Settings"),
    "a11y.changeDoseStatus" to ("تغییر وضعیت نوبت" to "Change dose status"),
    "a11y.editWater" to ("ویرایش ثبت آب" to "Edit water entry"),
    "a11y.deleteWater" to ("حذف ثبت آب" to "Delete water entry"),
    "a11y.deleteDoseTime" to ("حذف ساعت مصرف {0}" to "Remove dose time {0}"),
    "a11y.previousMonth" to ("ماه قبل" to "Previous month"),
    "a11y.nextMonth" to ("ماه بعد" to "Next month"),
    "a11y.selectedDate" to ("تاریخ انتخاب‌شده" to "Selected date"),
    "a11y.openDate" to ("انتخاب تاریخ" to "Choose date"),
    "error.schedule" to ("اطلاعات ذخیره شد، اما زمان‌بندی یادآوری کامل نشد. تنظیمات اعلان را بررسی کنید." to "Saved, but reminders could not be fully scheduled. Check notification settings."),
    "error.storage" to ("ذخیره یا خواندن اطلاعات انجام نشد؛ اطلاعات قبلی پاک نشده‌اند." to "Could not save or read your data. Your existing information has not been erased."),
    "error.calendar" to ("این تاریخ معتبر نیست. روز، ماه و سال را بررسی کنید." to "That date is not valid. Check the day, month, and year."),
    "error.time" to ("زمان را بررسی کنید؛ نمونهٔ درست 08:00 است." to "Check the time. For example, enter 08:00."),
    "error.number" to ("یک عدد معتبر وارد کنید." to "Enter a valid number."),
    "error.generic" to ("اطلاعات واردشده را بررسی کنید." to "Please check the information you entered."),

    "permission.title" to ("یادآوری‌ها به اجازه شما نیاز دارند" to "Reminders need your permission"),
    "permission.body" to ("برای دریافت یادآوری هنگام بسته‌بودن برنامه، اعلان‌ها را فعال کنید." to "Allow notifications to receive reminders when the app is closed."),
    "permission.enable" to ("فعال‌کردن اعلان‌ها" to "Enable notifications"),
    "permission.phoneSettings" to ("تنظیمات گوشی" to "Phone settings"),

    "today.eyebrow" to ("برنامهٔ امروز" to "TODAY"),
    "today.title" to ("هر روز، کمی مراقبت" to "A little care, every day"),
    "today.subtitle" to ("داروها و کارهای مهم امروز، یک‌جا و روشن." to "Today’s medication and essentials, clearly in one place."),
    "today.progress" to ("دارو: {0} از {1} نوبت مصرف شده" to "Medication: {0} of {1} doses taken"),
    "today.medicationCompact" to ("داروهای امروز" to "Medication today"),
    "today.waterCompact" to ("آب امروز" to "Water today"),
    "today.schedule" to ("برنامهٔ داروها" to "Medication schedule"),
    "today.addMedicine" to ("داروی جدید" to "Add medication"),
    "today.noMedication" to ("برای امروز نوبت دارویی ندارید." to "No medication doses are scheduled for today."),
    "today.noMedicationAction" to ("برای شروع، یک یادآور دارو بسازید." to "Create a medication reminder to get started."),
    "today.allDone" to ("همهٔ نوبت‌های داروی امروز مصرف شده‌اند." to "All of today’s medication doses are marked as taken."),
    "today.upcomingAppointment" to ("قرار پزشکی بعدی" to "Next appointment"),
    "today.noUpcoming" to ("یادآوری یا قرار آینده‌ای ندارید." to "You have no upcoming reminders or appointments."),
    "today.waterAction" to ("ثبت آب" to "Log water"),
    "today.appointmentAction" to ("قرار جدید" to "New appointment"),
    "today.dayCare" to ("روز خوبی برای مراقبت از خودتان است." to "A good day to take care of yourself."),
    "date.today" to ("امروز" to "Today"),

    "water.title" to ("آب روزانه" to "Daily water"),
    "water.history" to ("آب و سوابق" to "Water & history"),
    "water.progress" to ("{0} از {1} میلی‌لیتر" to "{0} of {1} ml"),
    "water.percent" to ("{0}٪" to "{0}%"),
    "water.remaining" to ("{0} میلی‌لیتر تا هدف روزانه" to "{0} ml to your daily goal"),
    "water.ml" to ("{0} میلی‌لیتر" to "{0} ml"),
    "unit.ml" to ("میلی‌لیتر" to "ml"),
    "water.custom" to ("ثبت مقدار دلخواه" to "Log custom amount"),
    "water.empty" to ("در این روز آبی ثبت نشده است." to "No water has been logged for this day."),
    "water.goal" to ("هدف روزانه" to "Daily goal"),
    "water.quickAdd" to ("افزودن {0} میلی‌لیتر" to "Add {0} ml"),
    "water.amountField" to ("مقدار به میلی‌لیتر" to "Amount in millilitres"),
    "water.amountPlaceholder" to ("مقدار دلخواه شما" to "Enter an amount"),
    "water.start" to ("از ساعت" to "From"),
    "water.end" to ("تا ساعت" to "Until"),
    "water.reminder" to ("یادآوری نوشیدن آب" to "Water reminders"),
    "water.interval" to ("فاصلهٔ یادآوری‌ها" to "Reminder interval"),
    "water.more" to ("گزینه‌های بیشتر" to "More options"),
    "water.retryDescription" to ("اگر آب ثبت نشد، یک بار دیگر یادآوری کن" to "If no water is logged, remind me once more"),
    "water.off" to ("خاموش" to "Off"),
    "water.afterMinutes" to ("{0} دقیقه بعد" to "After {0} minutes"),
    "water.resume" to ("ادامهٔ یادآوری آب" to "Resume water reminders"),
    "water.pause" to ("توقف یادآوری آب برای یک ساعت" to "Pause water reminders for one hour"),
    "water.goalReached" to ("هدف روزانهٔ آب تکمیل شده است." to "Daily water goal reached."),
    "water.deleteConfirm" to ("این ثبت آب حذف شود؟" to "Delete this water entry?"),
    "water.hours" to ("هر {0} ساعت" to "Every {0} hours"),
    "water.everyHour" to ("هر ۱ ساعت" to "Every hour"),
    "water.everyMinutes" to ("هر {0} دقیقه" to "Every {0} minutes"),

    "medication.title" to ("برنامهٔ داروها" to "Medication schedule"),
    "medication.new" to ("داروی جدید" to "New medication"),
    "medication.edit" to ("ویرایش دارو" to "Edit medication"),
    "medication.empty" to ("برنامهٔ دارویی ثبت نشده است." to "No medications have been added yet."),
    "medication.name" to ("نام دارو یا مکمل" to "Medication or supplement name"),
    "medication.nameRequired" to ("نام دارو را وارد کنید." to "Enter a medication name."),
    "medication.instructions" to ("مقدار یا دستور مصرف (اختیاری)" to "Dose or instructions (optional)"),
    "medication.time" to ("ساعت یادآوری" to "Reminder time"),
    "medication.timeNumber" to ("نوبت {0}: ساعت {1}" to "Dose {0}: {1}"),
    "medication.times" to ("ساعت‌های یادآوری" to "Reminder times"),
    "medication.addTime" to ("افزودن ساعت دیگر" to "Add another time"),
    "medication.duplicateTime" to ("این ساعت مصرف قبلاً اضافه شده است." to "That reminder time has already been added."),
    "medication.schedule" to ("برنامهٔ تکرار" to "Repeat schedule"),
    "medication.everyDay" to ("هر روز" to "Every day"),
    "medication.specificDates" to ("انتخاب تاریخ‌های مشخص" to "Choose specific dates"),
    "medication.dateList" to ("تاریخ‌های مصرف" to "Dose dates"),
    "medication.dateExampleSolar" to ("تاریخ‌ها را با تقویم شمسی وارد کنید؛ نمونه: ۱۴۰۵/۰۷/۱۸، ۱۴۰۵/۰۷/۲۵" to "Enter Solar Hijri dates; for example: 1405/07/18, 1405/07/25"),
    "medication.dateExampleGregorian" to ("تاریخ‌ها را با تقویم میلادی وارد کنید؛ نمونه: ۲۰۲۶/۱۰/۱۰، ۲۰۲۶/۱۰/۱۷" to "Enter Gregorian dates; for example: 2026-10-10, 2026-10-17"),
    "medication.weekdays" to ("روزهای هفته" to "Days of the week"),
    "medication.startDate" to ("شروع از" to "Starts on"),
    "medication.advanced" to ("تنظیم روزها و ساعت‌های بیشتر" to "More schedule options"),
    "medication.disclaimer" to ("نام و دستور مصرف را خودتان وارد می‌کنید؛ برنامه توصیهٔ پزشکی نمی‌دهد." to "You provide the medication details. Medora does not give medical advice."),
    "medication.status" to ("وضعیت مصرف" to "Dose history"),
    "medication.historyEmpty" to ("برای این روز نوبت مصرف دارو ثبت نشده است." to "No doses are scheduled for this day."),
    "medication.paused" to ("یادآوری دارو متوقف است" to "Medication reminders paused"),
    "medication.active" to ("یادآوری دارو فعال است" to "Medication reminders active"),
    "medication.deleteConfirm" to ("برنامهٔ دارو حذف شود؟ سوابق مصرف حفظ می‌شوند." to "Delete this medication schedule? Dose history will be kept."),

    "dose.pending" to ("مصرف ثبت نشده" to "Not marked as taken"),
    "dose.taken" to ("مصرف شد" to "Taken"),
    "dose.snoozed" to ("به تعویق افتاده" to "Snoozed"),
    "dose.skipped" to ("مصرف نشد" to "Skipped"),
    "dose.take" to ("مصرف کردم" to "Mark as taken"),
    "dose.snooze" to ("تعویق {0} دقیقه" to "Snooze {0} min"),
    "dose.until" to ("یادآوری مجدد ساعت {0}" to "Next reminder at {0}"),
    "dose.reset" to ("پاک‌کردن وضعیت مصرف" to "Clear dose status"),
    "dose.skip" to ("ثبت مصرف‌نشدن" to "Mark as not taken"),
    "dose.time" to ("ساعت {0}" to "At {0}"),

    "appointment.title" to ("قرارهای پزشکی" to "Medical appointments"),
    "appointment.new" to ("قرار جدید" to "New appointment"),
    "appointment.edit" to ("ویرایش قرار" to "Edit appointment"),
    "appointment.empty" to ("قرار آینده‌ای ثبت نشده است." to "No upcoming appointments."),
    "appointment.past" to ("گذشته و لغوشده" to "Past and cancelled"),
    "appointment.cancelled" to ("لغو شده" to "Cancelled"),
    "appointment.cancel" to ("لغو قرار" to "Cancel appointment"),
    "appointment.reactivate" to ("بازگرداندن قرار لغوشده" to "Restore cancelled appointment"),
    "appointment.deleteConfirm" to ("این قرار حذف شود؟" to "Delete this appointment?"),
    "appointment.doctor" to ("نام پزشک یا عنوان قرار" to "Doctor or appointment title"),
    "appointment.timeZone" to ("منطقهٔ زمانی محل قرار" to "Appointment time zone"),
    "appointment.timeZoneLabel" to ("زمان به وقت {0}" to "Time in {0}"),
    "appointment.timeZoneHelp" to ("نمونه: Asia/Tehran — ساعت قرار بر اساس منطقهٔ محل محاسبه می‌شود." to "Example: Asia/Tehran. The appointment follows the clinic’s local time."),
    "appointment.location" to ("مکان" to "Location"),
    "appointment.contact" to ("اطلاعات تماس" to "Contact information"),
    "appointment.notes" to ("توضیحات" to "Notes"),
    "appointment.reminderSummary" to ("از ساعت {0} روز قرار، هر {1} ساعت تا پیش از نوبت یادآوری می‌کنیم." to "On the day, reminders start at {0} and repeat every {1} hours until the appointment."),
    "appointment.earlyReminders" to ("یادآوری زودتر (اختیاری)" to "Additional reminders (optional)"),
    "appointment.oneHourBefore" to ("۱ ساعت قبل" to "1 hour before"),
    "appointment.minutesBefore" to ("{0} دقیقه قبل" to "{0} minutes before"),
    "appointment.startTime" to ("شروع یادآوری روز قرار" to "Start time on appointment day"),
    "appointment.everyHours" to ("هر {0} ساعت" to "Every {0} hours"),
    "appointment.everyHour" to ("هر ۱ ساعت" to "Every hour"),
    "appointment.twoHoursBefore" to ("۲ ساعت قبل" to "2 hours before"),
    "appointment.dayBefore" to ("روز قبل" to "1 day before"),
    "appointment.reminderLabel" to ("یادآوری: {0}" to "Reminder: {0}"),
    "appointment.locationLabel" to ("مکان: {0}" to "Location: {0}"),
    "appointment.contactLabel" to ("تماس: {0}" to "Contact: {0}"),
    "appointment.visitTime" to ("زمان نوبت: {0}، ساعت {1}" to "Appointment: {0} at {1}"),
    "appointment.clinicStart" to ("از صبح، پیش از رسیدن نوبت" to "Starting in the morning, before the appointment"),
    "appointment.settingsExplanation" to ("در روز قرار، نام پزشک، زمان و مکان را یادآوری می‌کنیم." to "On the day, we’ll remind you of the doctor, time, and location."),
    "appointment.repeatUntil" to ("تا قبل از نوبت، یادآوری کن" to "Repeat until the appointment"),
    "appointment.earlyVisit" to ("برای نوبت‌های پیش از ساعت شروع، یک ساعت زودتر یادآوری می‌شود. پس از زمان نوبت، یادآوری متوقف می‌شود." to "For earlier appointments, one reminder is sent an hour beforehand. Reminders stop at the appointment time."),

    "weekday.mon" to ("دوشنبه" to "Monday"),
    "weekday.tue" to ("سه‌شنبه" to "Tuesday"),
    "weekday.wed" to ("چهارشنبه" to "Wednesday"),
    "weekday.thu" to ("پنجشنبه" to "Thursday"),
    "weekday.fri" to ("جمعه" to "Friday"),
    "weekday.sat" to ("شنبه" to "Saturday"),
    "weekday.sun" to ("یکشنبه" to "Sunday"),
    "weekday.monShort" to ("د" to "Mon"),
    "weekday.tueShort" to ("س" to "Tue"),
    "weekday.wedShort" to ("چ" to "Wed"),
    "weekday.thuShort" to ("پ" to "Thu"),
    "weekday.friShort" to ("ج" to "Fri"),
    "weekday.satShort" to ("ش" to "Sat"),
    "weekday.sunShort" to ("ی" to "Sun"),

    "settings.title" to ("تنظیمات Medora" to "Medora settings"),
    "settings.subtitle" to ("یادآوری‌ها مطابق برنامهٔ روزانهٔ شما" to "Reminders that fit your routine"),
    "settings.display" to ("زبان و تقویم" to "Language & calendar"),
    "settings.language" to ("زبان برنامه" to "App language"),
    "settings.persian" to ("فارسی" to "Persian"),
    "settings.english" to ("English" to "English"),
    "settings.calendar" to ("تقویم نمایشی" to "Calendar"),
    "settings.solar" to ("شمسی" to "Solar Hijri"),
    "settings.gregorian" to ("میلادی" to "Gregorian"),
    "settings.calendarNote" to ("تغییر تقویم فقط شیوهٔ نمایش تاریخ را عوض می‌کند." to "Changing the calendar only changes how dates are displayed."),
    "settings.waterTab" to ("آب" to "Water"),
    "settings.appointmentsTab" to ("قرارها" to "Appointments"),
    "settings.notificationsTab" to ("اعلان‌ها" to "Notifications"),
    "settings.waterGoal" to ("هدف روزانهٔ آب" to "Daily water goal"),
    "settings.reminderDetails" to ("نمایش جزئیات در اعلان" to "Show details in notifications"),
    "settings.notificationsEnabled" to ("دریافت اعلان‌ها" to "Notifications"),
    "settings.notificationDetailsOn" to ("نام دارو، دستور مصرف و جزئیات قرار نمایش داده می‌شود." to "Medication instructions and appointment details will be shown."),
    "settings.notificationDetailsOff" to ("فقط پیام یادآوری نمایش داده می‌شود." to "Only a general reminder will be shown."),
    "settings.sampleNotification" to ("نمونهٔ اعلان" to "Notification preview"),
    "settings.sampleMedicine" to ("ویتامین D" to "Vitamin D"),
    "settings.sampleBody" to ("ساعت مصرف: ۰۸:۰۰\nطبق دستور ثبت‌شده" to "Dose time: 08:00\nAs instructed"),
    "settings.phonePermissions" to ("مجوزهای گوشی" to "Phone permissions"),
    "settings.exactEnabled" to ("یادآوری دقیق فعال است" to "Exact reminders are enabled"),
    "settings.enableExact" to ("فعال‌کردن یادآوری دقیق" to "Enable exact reminders"),
    "settings.openNotificationSettings" to ("تنظیمات اعلان در گوشی" to "Notification settings"),

    "datePicker.title" to ("انتخاب تاریخ" to "Choose a date"),
    "datePicker.previous" to ("ماه قبل" to "Previous month"),
    "datePicker.next" to ("ماه بعد" to "Next month"),
    "datePicker.noDate" to ("تاریخی انتخاب نشده است" to "No date selected"),
    "datePicker.invalid" to ("تاریخ نامعتبر است" to "Invalid date"),

    "form.waterNew" to ("ثبت آب" to "Log water"),
    "form.waterEdit" to ("ویرایش ثبت آب" to "Edit water entry"),
    "form.medicationNew" to ("داروی جدید" to "New medication"),
    "form.medicationEdit" to ("ویرایش دارو" to "Edit medication"),
    "form.appointmentNew" to ("قرار جدید" to "New appointment"),
    "form.appointmentEdit" to ("ویرایش قرار" to "Edit appointment"),
    "validation.waterAmount" to ("مقدار باید بین ۱ تا ۱۰٬۰۰۰ میلی‌لیتر باشد." to "Enter an amount from 1 to 10,000 ml."),
    "validation.waterFuture" to ("زمان ثبت آب نمی‌تواند در آینده باشد." to "A water entry cannot be in the future."),
    "validation.medicationName" to ("نام دارو را وارد کنید." to "Enter a medication name."),
    "validation.schedule" to ("حداقل یک روز یا تاریخ برای یادآوری انتخاب کنید." to "Choose at least one day or date for the reminder."),
    "validation.tooManyTimes" to ("از ۱ تا ۱۲ زمان مصرف مشخص کنید." to "Choose 1 to 12 dose times."),
    "validation.appointmentTitle" to ("عنوان قرار را وارد کنید." to "Enter an appointment title."),
    "validation.appointmentFuture" to ("قرار جدید باید در آینده باشد." to "A new appointment must be in the future."),
    "validation.timeZone" to ("منطقهٔ زمانی معتبر وارد کنید؛ نمونه: Asia/Tehran." to "Enter a valid time zone, for example Asia/Tehran."),
    "validation.goal" to ("هدف آب باید بین ۱ تا ۲۰٬۰۰۰ میلی‌لیتر باشد." to "The water goal must be between 1 and 20,000 ml."),
    "validation.waterWindow" to ("ساعت شروع باید پیش از ساعت پایان باشد." to "The start time must be before the end time."),

    "notification.channel" to ("یادآوری‌های سلامت" to "Health reminders"),
    "notification.channelDescription" to ("یادآوری آب، دارو و قرارهای پزشکی" to "Water, medication, and appointment reminders"),
    "notification.brand" to ("زمان یادآوری مدورا" to "Medora reminder"),
    "notification.privateBody" to ("برای دیدن جزئیات، برنامه را باز کنید." to "Open the app to view details."),
    "notification.waterTitle" to ("وقت نوشیدن آب" to "Time to drink water"),
    "notification.waterBody" to ("مقدار نوشیده‌شده را ثبت کنید." to "Log the water you have had."),
    "notification.waterSnoozed" to ("یادآوری به تعویق افتاده" to "Water reminder snoozed"),
    "notification.doseTitle" to ("وقت مصرف {0}" to "Time for {0}"),
    "notification.doseTime" to ("ساعت مصرف: {0}" to "Dose time: {0}"),
    "notification.appointmentTitle" to ("قرار پزشکی: {0}" to "Medical appointment: {0}"),
    "notification.appointmentTime" to ("زمان نوبت: {0}، ساعت {1}" to "Appointment: {0} at {1}"),
    "notification.location" to ("مکان: {0}" to "Location: {0}"),
    "notification.contact" to ("تماس: {0}" to "Contact: {0}"),
    "notification.actionWater" to ("ثبت ۲۵۰ میلی‌لیتر" to "Log 250 ml"),
    "notification.actionTaken" to ("مصرف کردم" to "Taken"),
    "notification.actionSnooze" to ("تعویق {0} دقیقه" to "Snooze {0} min")
)

fun localizedText(key: String, language: String, vararg args: Any?): String {
    var result = copy[key]?.let { if (language == "en") it.second else it.first } ?: key
    args.forEachIndexed { index, value ->
        val formatted = when (value) {
            null -> ""
            is Number -> localizedNumber(value, language)
            else -> value.toString()
        }
        result = result.replace("{$index}", formatted)
    }
    return result
}

fun localizedNumber(value: Any, language: String): String {
    val ascii = value.toString()
    return if (language == "en") ascii else ascii.map { digit ->
        if (digit in '0'..'9') "۰۱۲۳۴۵۶۷۸۹"[digit - '0'] else digit
    }.joinToString("")
}

fun languageLocale(language: String): Locale = if (language == "en") Locale.ENGLISH else Locale("fa", "IR")

fun Context.withAppLocale(language: String): Context {
    val locale = languageLocale(language)
    val configuration = Configuration(resources.configuration).apply {
        setLocale(locale)
        setLayoutDirection(locale)
    }
    // Keep the Activity as the base: a configuration-only Context loses the dialog window token.
    return ContextThemeWrapper(this, R.style.Theme_Medora).apply {
        applyOverrideConfiguration(configuration)
    }
}

@Composable
fun tr(key: String, vararg args: Any?): String = localizedText(key, LocalLanguage.current, *args)

@Composable
fun n(value: Any): String = localizedNumber(value, LocalLanguage.current)

fun localizedWeekday(day: Int, language: String): String = localizedText(
    "weekday." + listOf("mon", "tue", "wed", "thu", "fri", "sat", "sun")[day - 1], language
)

fun localizedOffsetLabel(minutes: Int, language: String): String = when(minutes) {
    60 -> localizedText("appointment.oneHourBefore", language)
    120 -> localizedText("appointment.twoHoursBefore", language)
    1440 -> localizedText("appointment.dayBefore", language)
    else -> localizedText("appointment.minutesBefore", language, minutes)
}

