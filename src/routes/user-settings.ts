



// // src/routes/user-settings.ts
// import { Router } from "express";
// import {
//   getUserSettings,
//   updateProfile,
//   updateEmail,
//   updatePhone,
//   updatePassword,
//   updateProfileImage,
//   deleteAccount,
// } from "@/controllers/user-settings";
// import { authenticateToken } from "@/utils/auth";

// const userSettingsRouter = Router();

// // All routes protected with authentication middleware
// userSettingsRouter.get("/users/settings", authenticateToken, getUserSettings);
// userSettingsRouter.patch("/users/settings/profile", authenticateToken, updateProfile);
// userSettingsRouter.patch("/users/settings/email", authenticateToken, updateEmail);
// userSettingsRouter.patch("/users/settings/phone", authenticateToken, updatePhone);
// userSettingsRouter.patch("/users/settings/password", authenticateToken, updatePassword);
// userSettingsRouter.patch("/users/settings/image", authenticateToken, updateProfileImage);
// userSettingsRouter.delete("/users/settings/account", authenticateToken, deleteAccount);

// export default userSettingsRouter;





// src/routes/user-settings.ts
import { Router } from "express";
import {
  getUserSettings,
  updateProfile,
  updateEmail,
  updatePhone,
  updatePassword,
  updateProfileImage,
  deleteAccount,
} from "@/controllers/user-settings";

const userSettingsRouter = Router();

// ⚠️ Authentication temporarily removed for testing — add back before production
userSettingsRouter.get("/users/settings", getUserSettings);
userSettingsRouter.patch("/users/settings/profile", updateProfile);
userSettingsRouter.patch("/users/settings/email", updateEmail);
userSettingsRouter.patch("/users/settings/phone", updatePhone);
userSettingsRouter.patch("/users/settings/password", updatePassword);
userSettingsRouter.patch("/users/settings/image", updateProfileImage);
userSettingsRouter.delete("/users/settings/account", deleteAccount);

export default userSettingsRouter;