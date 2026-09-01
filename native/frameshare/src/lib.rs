//! figment-frameshare: publishes Figment's rendered frames to other apps.
//!
//! macOS backend: Syphon (statically linked vendored framework sources,
//! driven through the C shim in macos/shim.m). Windows backend (Spout) is
//! planned; on unsupported platforms the module loads but reports
//! unavailable so the JS side can degrade gracefully.

#[macro_use]
extern crate napi_derive;

use napi::bindgen_prelude::*;

#[cfg(target_os = "macos")]
mod ffi {
    use std::os::raw::{c_char, c_int, c_void};

    extern "C" {
        pub fn fs_syphon_server_create(utf8_name: *const c_char) -> *mut c_void;
        pub fn fs_syphon_server_publish(
            handle: *mut c_void,
            pixels: *const u8,
            width: u32,
            height: u32,
            bytes_per_row: u32,
            flipped: c_int,
        ) -> c_int;
        pub fn fs_syphon_server_has_clients(handle: *mut c_void) -> c_int;
        pub fn fs_syphon_server_set_name(handle: *mut c_void, utf8_name: *const c_char);
        pub fn fs_syphon_server_destroy(handle: *mut c_void);
    }
}

/// True when this build can actually share frames on the current platform.
#[napi]
pub fn is_available() -> bool {
    cfg!(target_os = "macos")
}

/// Name of the sharing technology backing this build.
#[napi]
pub fn backend_name() -> String {
    if cfg!(target_os = "macos") {
        "syphon".to_string()
    } else {
        "unsupported".to_string()
    }
}

#[napi]
pub struct FrameSender {
    // Opaque native handle (FSServerBox on macOS); 0 after destroy.
    handle: usize,
}

#[napi]
impl FrameSender {
    #[napi(constructor)]
    pub fn new(name: String) -> Result<Self> {
        #[cfg(target_os = "macos")]
        {
            let c_name = std::ffi::CString::new(name)
                .map_err(|_| Error::from_reason("server name contains a NUL byte"))?;
            let handle = unsafe { ffi::fs_syphon_server_create(c_name.as_ptr()) };
            if handle.is_null() {
                return Err(Error::from_reason(
                    "could not start Syphon server (no Metal device available?)",
                ));
            }
            Ok(FrameSender {
                handle: handle as usize,
            })
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = name;
            Err(Error::from_reason(
                "frame sharing is not supported on this platform",
            ))
        }
    }

    /// Publish one RGBA8 frame. `data` must hold at least `width * height * 4`
    /// bytes, tightly packed. The buffer is consumed synchronously and can be
    /// reused by the caller as soon as this returns.
    #[napi]
    pub fn publish(
        &self,
        data: Uint8Array,
        width: u32,
        height: u32,
        flipped: Option<bool>,
    ) -> Result<()> {
        if self.handle == 0 {
            return Err(Error::from_reason("sender has been destroyed"));
        }
        let bytes_per_row = width
            .checked_mul(4)
            .ok_or_else(|| Error::from_reason("frame width out of range"))?;
        let expected = (bytes_per_row as u64) * (height as u64);
        if (data.len() as u64) < expected {
            return Err(Error::from_reason(format!(
                "frame buffer too small: got {} bytes, need {} for {}x{} RGBA",
                data.len(),
                expected,
                width,
                height
            )));
        }
        #[cfg(target_os = "macos")]
        {
            let status = unsafe {
                ffi::fs_syphon_server_publish(
                    self.handle as *mut _,
                    data.as_ptr(),
                    width,
                    height,
                    bytes_per_row,
                    if flipped.unwrap_or(false) { 1 } else { 0 },
                )
            };
            if status != 0 {
                return Err(Error::from_reason(format!(
                    "publishing frame failed (native error {status})"
                )));
            }
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = flipped;
            Err(Error::from_reason(
                "frame sharing is not supported on this platform",
            ))
        }
    }

    /// True when at least one client is connected to this server. Callers can
    /// skip the GPU readback entirely while nothing is listening.
    #[napi]
    pub fn has_clients(&self) -> bool {
        if self.handle == 0 {
            return false;
        }
        #[cfg(target_os = "macos")]
        {
            unsafe { ffi::fs_syphon_server_has_clients(self.handle as *mut _) != 0 }
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }

    /// Rename the server without dropping connected clients.
    #[napi]
    pub fn set_name(&self, name: String) -> Result<()> {
        if self.handle == 0 {
            return Err(Error::from_reason("sender has been destroyed"));
        }
        #[cfg(target_os = "macos")]
        {
            let c_name = std::ffi::CString::new(name)
                .map_err(|_| Error::from_reason("server name contains a NUL byte"))?;
            unsafe { ffi::fs_syphon_server_set_name(self.handle as *mut _, c_name.as_ptr()) };
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = name;
            Ok(())
        }
    }

    /// Stop the server and release native resources. Idempotent.
    #[napi]
    pub fn destroy(&mut self) {
        if self.handle != 0 {
            #[cfg(target_os = "macos")]
            unsafe {
                ffi::fs_syphon_server_destroy(self.handle as *mut _)
            };
            self.handle = 0;
        }
    }
}

impl Drop for FrameSender {
    fn drop(&mut self) {
        self.destroy();
    }
}
