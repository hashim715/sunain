import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
} from "libphonenumber-js";

export const validateAndNormalizePhoneNumber = (
  phoneNumber: string
): {
  isValid: boolean;
  normalized: string | null;
} => {
  try {
    if (!isValidPhoneNumber(phoneNumber)) {
      return { isValid: false, normalized: null };
    }

    const parsedNumber = parsePhoneNumberFromString(phoneNumber);

    if (!parsedNumber) {
      return { isValid: false, normalized: null };
    }

    return {
      isValid: true,
      normalized: parsedNumber.number,
    };
  } catch (error) {
    return { isValid: false, normalized: null };
  }
};
