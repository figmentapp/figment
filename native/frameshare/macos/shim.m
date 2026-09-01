/*
 shim.m — C ABI over SyphonMetalServer for the figment-frameshare addon.

 Design notes:
 - Syphon discovery is request/response over NSDistributedNotificationCenter:
   a client's SyphonServerDirectory posts an announce request and drops every
   server that does not answer within 6 seconds. Those notifications are only
   ever delivered on the process main thread's run loop, and Electron's
   renderer main thread does not pump one, so a server in this process never
   sees the request. Instead each server re-announces itself every 2 seconds
   from a timer on a dedicated run-loop thread; the directory treats a repeat
   announce for a known server as a keep-alive.
 - Servers are created and destroyed on that same thread.
 - Publishing runs on the caller's thread: SyphonMetalServer is documented
   thread-safe, and replaceRegion is a synchronous CPU->GPU copy, so the
   pixel buffer does not need to outlive the call.
 - Compiled with ARC. Handles returned to Rust are CFBridgingRetain'ed.
*/

#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#import "SyphonMetalServer.h"

#include <stdint.h>

// Interval between keep-alive announces; must stay well under the 6 second
// timeout in SyphonServerDirectory.
static const NSTimeInterval kFSAnnounceInterval = 2.0;

// App name clients show for this server. Without it the description carries
// the bundle name of the Electron process, "Figment Helper (Renderer)".
extern NSString *SyphonServerAppNameOverride;

@interface SyphonServerBase (FSAnnounce)
- (void)broadcastServerAnnounce;
@end

@interface FSServerBox : NSObject
@property(strong) SyphonMetalServer *server;
@property(strong) id<MTLDevice> device;
@property(strong) id<MTLCommandQueue> queue;
@property(strong) id<MTLTexture> texture;
// Command buffer of the last publish; it reads `texture` on the GPU.
@property(strong) id<MTLCommandBuffer> inFlight;
@property(strong) NSTimer *announceTimer;
@end

@implementation FSServerBox
@end

@interface FSBlockRunner : NSObject
- (void)runBlock:(void (^)(void))block;
@end

@implementation FSBlockRunner
- (void)runBlock:(void (^)(void))block
{
    block();
}
@end

static NSThread *fs_thread = nil;
static FSBlockRunner *fs_runner = nil;

static void fs_ensure_thread(void)
{
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        fs_runner = [FSBlockRunner new];
        fs_thread = [[NSThread alloc] initWithBlock:^{
            @autoreleasepool {
                NSRunLoop *runLoop = [NSRunLoop currentRunLoop];
                // Keep the run loop alive even with no other sources.
                [runLoop addPort:[NSMachPort port] forMode:NSDefaultRunLoopMode];
                while (YES) {
                    @autoreleasepool {
                        [runLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate distantFuture]];
                    }
                }
            }
        }];
        fs_thread.name = @"figment-syphon";
        [fs_thread start];
    });
}

static void fs_run_on_syphon_thread(void (^block)(void))
{
    fs_ensure_thread();
    [fs_runner performSelector:@selector(runBlock:)
                      onThread:fs_thread
                    withObject:[block copy]
                 waitUntilDone:YES];
}

void *fs_syphon_server_create(const char *utf8_name)
{
    __block FSServerBox *box = nil;
    fs_run_on_syphon_thread(^{
        @autoreleasepool {
            id<MTLDevice> device = MTLCreateSystemDefaultDevice();
            if (device == nil) {
                return;
            }
            NSString *name = utf8_name != NULL ? [NSString stringWithUTF8String:utf8_name] : nil;
            SyphonServerAppNameOverride = @"Figment";
            SyphonMetalServer *server = [[SyphonMetalServer alloc] initWithName:name
                                                                         device:device
                                                                        options:nil];
            if (server == nil) {
                return;
            }
            id<MTLCommandQueue> queue = [device newCommandQueue];
            if (queue == nil) {
                [server stop];
                return;
            }
            box = [FSServerBox new];
            box.server = server;
            box.device = device;
            box.queue = queue;
            // Scheduled on this thread's run loop, which fs_thread keeps pumping.
            box.announceTimer = [NSTimer scheduledTimerWithTimeInterval:kFSAnnounceInterval
                                                                repeats:YES
                                                                  block:^(NSTimer *__unused timer) {
                                                                      [server broadcastServerAnnounce];
                                                                  }];
        }
    });
    if (box == nil) {
        return NULL;
    }
    return (void *)CFBridgingRetain(box);
}

int fs_syphon_server_publish(void *handle,
                             const uint8_t *pixels,
                             uint32_t width,
                             uint32_t height,
                             uint32_t bytes_per_row,
                             int flipped)
{
    if (handle == NULL || pixels == NULL || width == 0 || height == 0) {
        return -1;
    }
    FSServerBox *box = (__bridge FSServerBox *)handle;
    @autoreleasepool {
        // replaceRegion must not overwrite the texture while the GPU still
        // reads it for the previous frame. The blit is tiny, so this rarely
        // blocks for more than a few microseconds.
        [box.inFlight waitUntilCompleted];
        box.inFlight = nil;
        id<MTLTexture> texture = box.texture;
        if (texture == nil || texture.width != width || texture.height != height) {
            MTLTextureDescriptor *desc =
                [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatRGBA8Unorm
                                                                   width:width
                                                                  height:height
                                                               mipmapped:NO];
            desc.usage = MTLTextureUsageShaderRead;
            // Shared textures are unsupported on discrete GPUs; Managed is
            // deprecated-but-fine on Apple silicon, so pick per device.
            desc.storageMode =
                box.device.hasUnifiedMemory ? MTLStorageModeShared : MTLStorageModeManaged;
            texture = [box.device newTextureWithDescriptor:desc];
            if (texture == nil) {
                return -2;
            }
            box.texture = texture;
        }
        [texture replaceRegion:MTLRegionMake2D(0, 0, width, height)
                   mipmapLevel:0
                     withBytes:pixels
                   bytesPerRow:bytes_per_row];
        id<MTLCommandBuffer> commandBuffer = [box.queue commandBuffer];
        if (commandBuffer == nil) {
            return -3;
        }
        [box.server publishFrameTexture:texture
                        onCommandBuffer:commandBuffer
                            imageRegion:NSMakeRect(0, 0, width, height)
                                flipped:flipped ? YES : NO];
        [commandBuffer commit];
        box.inFlight = commandBuffer;
    }
    return 0;
}

int fs_syphon_server_has_clients(void *handle)
{
    if (handle == NULL) {
        return 0;
    }
    FSServerBox *box = (__bridge FSServerBox *)handle;
    return box.server.hasClients ? 1 : 0;
}

void fs_syphon_server_set_name(void *handle, const char *utf8_name)
{
    if (handle == NULL || utf8_name == NULL) {
        return;
    }
    FSServerBox *box = (__bridge FSServerBox *)handle;
    box.server.name = [NSString stringWithUTF8String:utf8_name];
}

void fs_syphon_server_destroy(void *handle)
{
    if (handle == NULL) {
        return;
    }
    FSServerBox *box = (FSServerBox *)CFBridgingRelease(handle);
    fs_run_on_syphon_thread(^{
        [box.announceTimer invalidate];
        box.announceTimer = nil;
        [box.server stop];
        box.server = nil;
        [box.inFlight waitUntilCompleted];
        box.inFlight = nil;
        box.texture = nil;
        box.queue = nil;
        box.device = nil;
    });
}
