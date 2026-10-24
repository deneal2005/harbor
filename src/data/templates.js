// Reminder templates, editable in Escalation Settings. Placeholders: {customer} {company} {number}
// {amount} (current balance) {total} {dueDate} {days} {promiseDate} {business} {owner} {phone}
// {email} {link}. Firm but never threatening; no legal consequences are implied.
// Hindi drafts were written for this prototype and have not been professionally reviewed.

export const TEMPLATES = {
  headsUp: {
    en: 'Hello {customer}, a friendly note from {business}: invoice {number} for {amount} is due on {dueDate}. Invoice and payment details: {link}. Thank you! — {owner}, {phone}',
    hi: 'नमस्ते {customer}, {business} की ओर से एक छोटी सी याद: इनवॉइस {number} की राशि {amount} की भुगतान तिथि {dueDate} है। इनवॉइस और भुगतान की जानकारी: {link}. धन्यवाद! — {owner}, {phone}',
  },
  due: {
    en: 'Hello {customer}, invoice {number} from {business} for {amount} is due today ({dueDate}). You can view it and the payment details here: {link}. Please let us know once paid. — {owner}, {phone}',
    hi: 'नमस्ते {customer}, {business} का इनवॉइस {number} ({amount}) आज ({dueDate}) देय है। इनवॉइस और भुगतान की जानकारी यहाँ देखें: {link}. भुगतान होने पर कृपया बता दें। — {owner}, {phone}',
  },
  firm: {
    en: 'Dear {customer}, invoice {number} for {amount} was due on {dueDate} and is now {days} days overdue. Please arrange payment or tell us the date you expect to pay: {link}. If something is wrong with the invoice, you can tell us on the same page. — {owner}, {business}, {phone}',
    hi: 'प्रिय {customer}, इनवॉइस {number} ({amount}) की भुगतान तिथि {dueDate} थी और अब {days} दिन बीत चुके हैं। कृपया भुगतान करें या बताएँ कि भुगतान कब तक होगा: {link}. अगर इनवॉइस में कोई गलती है तो उसी पेज पर बताएँ। — {owner}, {business}, {phone}',
  },
  final: {
    en: 'Dear {customer}, this is our final reminder for invoice {number}: {amount} remains unpaid, {days} days after the due date of {dueDate}. Please confirm a payment date by replying or at {link}. I will also call you to sort this out. — {owner}, {business}, {phone}',
    hi: 'प्रिय {customer}, इनवॉइस {number} के लिए यह हमारा अंतिम रिमाइंडर है: देय तिथि {dueDate} के {days} दिन बाद भी {amount} बकाया है। कृपया जवाब देकर या {link} पर भुगतान की तारीख बताएँ। हम इस बारे में आपको फ़ोन भी करेंगे। — {owner}, {business}, {phone}',
  },
  demand: {
    en: 'Dear {customer}, invoice {number} ({amount}) is now {days} days overdue. We are preparing a Payment Demand Letter listing the outstanding amount. If payment is already on its way or there is an issue with the invoice, please tell us at {link} or call {phone}. — {owner}, {business}',
    hi: 'प्रिय {customer}, इनवॉइस {number} ({amount}) को देय तिथि के बाद {days} दिन हो चुके हैं। हम बकाया राशि का भुगतान माँग पत्र (Payment Demand Letter) तैयार कर रहे हैं। अगर भुगतान हो चुका है या इनवॉइस में कोई समस्या है तो {link} पर बताएँ या {phone} पर कॉल करें। — {owner}, {business}',
  },
  review: {
    en: 'Dear {customer}, invoice {number} ({amount}) has been outstanding for {days} days past its due date. I would like to speak with you this week to agree a way forward. Please call me on {phone} or reply at {link}. — {owner}, {business}',
    hi: 'प्रिय {customer}, इनवॉइस {number} ({amount}) देय तिथि के {days} दिन बाद भी बकाया है। हम इस हफ़्ते आपसे बात करके आगे का रास्ता तय करना चाहते हैं। कृपया {phone} पर कॉल करें या {link} पर जवाब दें। — {owner}, {business}',
  },
  disputeResolved: {
    en: 'Hello {customer}, thank you for raising the issue on invoice {number}. We have reviewed it and the amount now due is {amount}. Details: {link}. — {owner}, {business}, {phone}',
    hi: 'नमस्ते {customer}, इनवॉइस {number} की समस्या बताने के लिए धन्यवाद। हमने इसकी जाँच कर ली है और अब देय राशि {amount} है। जानकारी: {link}. — {owner}, {business}, {phone}',
  },
  promiseConfirm: {
    en: 'Hello {customer}, thank you for confirming that invoice {number} ({amount}) will be paid by {promiseDate}. We will not send reminders before then. — {owner}, {business}',
    hi: 'नमस्ते {customer}, यह बताने के लिए धन्यवाद कि इनवॉइस {number} ({amount}) का भुगतान {promiseDate} तक हो जाएगा। तब तक हम कोई रिमाइंडर नहीं भेजेंगे। — {owner}, {business}',
  },
};
