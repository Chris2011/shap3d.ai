/** The current text of the `<input>`, `<select>` or `<textarea>` that fired `event`. */
export const valueOf = (event: Event) => (event.target as HTMLInputElement).value;

/** The current value of a number field or slider that fired `event`. */
export const numberOf = (event: Event) => Number(valueOf(event));

/** Whether the checkbox that fired `event` is now ticked. */
export const checkedOf = (event: Event) => (event.target as HTMLInputElement).checked;
