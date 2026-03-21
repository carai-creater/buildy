/**
 * Supabase session storage: localStorage (remember) vs sessionStorage (until tab close).
 * Flag lives in sessionStorage so it clears when the tab closes for "session-only" mode.
 */
(function (w) {
  var FLAG = "buildy_use_session_auth";
  w.buildyGetAuthStorage = function () {
    try {
      if (w.sessionStorage && w.sessionStorage.getItem(FLAG) === "1") {
        return w.sessionStorage;
      }
    } catch (_) {}
    return w.localStorage;
  };
  /** @param {boolean} remember - true: persist across browser restarts (localStorage) */
  w.buildySetRememberSession = function (remember) {
    try {
      if (remember) w.sessionStorage.removeItem(FLAG);
      else w.sessionStorage.setItem(FLAG, "1");
    } catch (_) {}
  };
  w.buildyGetStoredCreatorId = function () {
    try {
      return (
        w.sessionStorage.getItem("buildy_creator_id") ||
        w.localStorage.getItem("buildy_creator_id") ||
        ""
      );
    } catch (_) {
      return "";
    }
  };
  w.buildySetCreatorId = function (id) {
    if (!id) return;
    var st = w.buildyGetAuthStorage();
    try {
      st.setItem("buildy_creator_id", id);
      var other = st === w.localStorage ? w.sessionStorage : w.localStorage;
      other.removeItem("buildy_creator_id");
    } catch (_) {}
  };
  w.buildySetUserId = function (id) {
    if (!id) return;
    var st = w.buildyGetAuthStorage();
    try {
      st.setItem("buildy_user_id", id);
      var other = st === w.localStorage ? w.sessionStorage : w.localStorage;
      other.removeItem("buildy_user_id");
    } catch (_) {}
  };
  w.buildyGetStoredUserId = function () {
    try {
      return (
        w.sessionStorage.getItem("buildy_user_id") ||
        w.localStorage.getItem("buildy_user_id") ||
        ""
      );
    } catch (_) {
      return "";
    }
  };
  w.buildyClearCreatorSession = function () {
    try {
      w.localStorage.removeItem("buildy_creator_id");
      w.sessionStorage.removeItem("buildy_creator_id");
      w.sessionStorage.removeItem(FLAG);
    } catch (_) {}
  };
})(typeof window !== "undefined" ? window : globalThis);
