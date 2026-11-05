export function label(user) {
  if (user.name) {
    return user.name;
  } else {
    return user.email;
  }
}
