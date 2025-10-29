import { db } from "@/db/db";
import { generateSlug } from "@/utils/generateSlug";
import { Request, Response } from "express";
import bcrypt from "bcrypt"
import { generateAccessToken, generateRefreshToken, TokenPayload } from "@/utils/tokens";
import { AuthRequest } from "@/utils/auth";

export async function createUser(req: Request, res: Response) {
  const {email,image,phone,password,firstName,lastName,role,parkingLotId} = req.body;
  // const slug = generateSlug(name);
  try {
    // Check if the user already exists\
    const existingUser = await db.user.findUnique({
      where: {email}});
    if (existingUser) {
      return res.status(409).json({
        data: null,
        error: "user with this email already exists",
        
      });
    }
    // hash password
    const hashedPassword= await bcrypt.hash(password,10);
    const newUser = await db.user.create({
      data: {image,email,phone,password:hashedPassword,firstName,lastName,role,parkingLotId}
    });
    console.log(
      `user created successfully: ${newUser.firstName} (${newUser.id})`
    );
    return res.status(201).json({
      data: newUser,
      error: null,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      data: null,
      error: "Something went wrong",
      setLoading:false
    });
  }
}

// login user
export async function loginUser(req: Request, res: Response) {
  const {email,password} = req.body;
  
  try {
    const existingUser = await db.user.findFirst({
      where: {
       email
      },
    });
 
    if (!existingUser) {
      return res.status(401).json({
        error: "Invalid credentials",
        data: null,
      });
    }
    const isPasswordValid = await bcrypt.compare(password, existingUser.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Invalid credentials",
        data: null,
      });
    }
        // Generate tokens
        const tokenPayload: TokenPayload = {
          userId: existingUser.id,
          email: existingUser.email,
          role: existingUser.role,
        };

        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);
     
        await db.refreshToken.create({
          data: {
            token: refreshToken,
            userId: existingUser.id,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        });
         // Remove sensitive data
    const { password: _, ...userWithoutPassword } = existingUser;
 
    return res.status(200).json({
      data: {
        user: userWithoutPassword,
        accessToken,
        refreshToken,
      },
      error: null,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      error: "An error occurred during login",
      data: null,
    });
  }
}

// get all users
export async function getAllUsers(req: Request, res: Response) {
  try {
    const users = await db.user.findMany({
      orderBy: {
        createdAt: "desc",
      },include:{
        bookings:true,
        parkingLot:true

      }
    });
    return res.status(200).json(users);
  } catch (error) {
    console.log(error);
  }
}


export async function getCurrentUser(req: AuthRequest, res: Response) {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user?.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        image: true,
        role: true,
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    return res.status(200).json({ data: user });
  } catch (error) {
    console.error("Error fetching current user:", error);
    return res.status(500).json({ error: "Server error" });
  }
}

// Delete a user by ID
export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params;

  try {
    // Check if the user exists
    const existingUser = await db.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({
        error: "User not found",
        data: null,
      });
    }

    // Delete the user
    const deletedUser = await db.user.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "User deleted successfully",
      data: deletedUser,
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({
      error: "Failed to delete user",
      data: null,
    });
  }
}



