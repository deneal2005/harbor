// upi:// payment intent. Opening it in a UPI app pre-fills a payment; it proves nothing.
export const upiUri = (business, amountPaise, ref) =>
  `upi://pay?pa=${encodeURIComponent(business.upiId)}&pn=${encodeURIComponent(business.name)}&am=${(amountPaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(ref)}`;
