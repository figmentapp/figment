use std::env;
use std::fs;
use std::path::PathBuf;

// Vendored Syphon compile set: server-side code paths plus the Metal
// renderer. See vendor/syphon/VENDOR.md for provenance and local patches.
const SYPHON_OBJC_SOURCES: &[&str] = &[
    "SyphonServerBase.m",
    "SyphonMetalServer.m",
    "SyphonServerRendererMetal.m",
    "SyphonServerConnectionManager.m",
    "SyphonPrivate.m",
    "SyphonMessaging.m",
    "SyphonMessageQueue.m",
    "SyphonMessageReceiver.m",
    "SyphonMessageSender.m",
    "SyphonCFMessageReceiver.m",
    "SyphonCFMessageSender.m",
    "SyphonImageBase.m",
];

fn main() {
    napi_build::setup();

    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "macos" {
        build_macos();
    }

    println!("cargo:rerun-if-changed=vendor/syphon");
    println!("cargo:rerun-if-changed=macos");
}

fn build_macos() {
    let vendor = PathBuf::from("vendor/syphon");
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    // Syphon headers import each other framework-style (<Syphon/...>), so
    // mirror them into an include tree that satisfies those imports.
    let framework_include = out_dir.join("include/Syphon");
    fs::create_dir_all(&framework_include).unwrap();
    for entry in fs::read_dir(&vendor).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().map_or(false, |e| e == "h" || e == "pch") {
            fs::copy(&path, framework_include.join(path.file_name().unwrap())).unwrap();
        }
    }

    // Syphon is vendored upstream code that compiles clean under -Wall but
    // not under the -Wextra that cc adds by default (unused block parameters,
    // stray semicolons before method bodies). Keep the diff against upstream
    // minimal and drop -Wextra instead of patching the sources.
    let mut objc = cc::Build::new();
    objc.extra_warnings(false);
    for src in SYPHON_OBJC_SOURCES {
        objc.file(vendor.join(src));
    }
    objc.file("macos/shim.m")
        .include(&vendor)
        .include("macos")
        .include(out_dir.join("include"))
        .flag("-fobjc-arc")
        .flag("-include")
        .flag(vendor.join("Syphon_Prefix.pch").to_str().unwrap())
        .flag("-Wno-deprecated-declarations")
        .compile("syphon_objc");

    cc::Build::new()
        .file(vendor.join("SyphonDispatch.c"))
        .include(&vendor)
        .compile("syphon_dispatch");

    for framework in ["Foundation", "AppKit", "Metal", "IOSurface", "CoreGraphics"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
}
