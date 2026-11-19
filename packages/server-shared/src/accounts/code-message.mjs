export function codeMessage(code, reset, language) {
  const localized = code.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  return {
    subject: reset
      ? language === "en"
        ? "Reset your Medora password"
        : "بازیابی رمز مدورا"
      : language === "en"
        ? "Verify your email for Medora"
        : "تأیید ایمیل برای مدورا",
    text: reset
      ? language === "en"
        ? `Your Medora password reset code is ${code}.\nIt expires in 10 minutes. If you didn't request a password reset, ignore this email.`
        : `کد بازیابی رمز مدورا: ${localized}\nاین کد تا ۱۰ دقیقه اعتبار دارد. اگر درخواست بازیابی نداده‌اید، این پیام را نادیده بگیرید.`
      : language === "en"
        ? `Your Medora email verification code is ${code}.\nIt expires in 10 minutes. If you didn't request a code, you can ignore this email.`
        : `کد تأیید ایمیل شما در مدورا: ${localized}\nاین کد تا ۱۰ دقیقه اعتبار دارد. اگر شما درخواست کد نداده‌اید، این پیام را نادیده بگیرید.`,
  };
}
