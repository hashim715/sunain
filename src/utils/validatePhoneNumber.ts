import { isValidPhoneNumber } from "libphonenumber-js";

export const validatePhoneNumber = (number: string, country?: string) => {
  try {
    if (country) {
      return isValidPhoneNumber(number);
    }

    return isValidPhoneNumber(number);
  } catch (error) {
    return false;
  }
};

// console.log(validatePhoneNumber("+923163070715"));
