export const isDefined = (str: string) => !!str;

export const isStringArray = (value: any) =>
  Array.isArray(value) && value.every((x) => typeof x === "string");

export const isValidationError = (value: any) =>
  typeof value?.property !== "undefined" &&
  typeof value?.reason !== "undefined";

export const replaceWhitespace = (str: string) => str.replace(/\s+/g, "");

export const toStringArray = (value: any) =>
  Array.isArray(value)
    ? value.flatMap(replaceWhitespace).filter(isDefined)
    : value?.split(",").map(replaceWhitespace).filter(isDefined);
