export function invitationMessage(link, english) {
  return {
    subject: english
      ? "Medora care group invitation"
      : "دعوت به گروه مراقبت در مدورا",
    text: english
      ? `Open this link to review the invitation: ${link}\nIf you do not have an account, sign up with this email address.`
      : `برای بررسی دعوت، این پیوند را باز کنید: ${link}\nاگر حساب مدورا ندارید، با همین ایمیل ثبت‌نام کنید.`,
  };
}
