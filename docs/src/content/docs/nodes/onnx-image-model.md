---
title: "ONNX Image Model"
---

# ONNX Image Model

Run a PIX2PIX image to image model developed in ONNX. This is similar to [Image to Image](image-to-image.md) but uses an ONNX model instead of a TensorFlow.js model.

This currently only runs 512x512 image models.

To work well, it needs an input that is similar to what it has seen in training; e.g. if you trained it on a hand model, you need to feed it hand models with the same color and line thickness.

## Parameters

- **Model** The .onnx model file.

## Training

Here's a simple example of how to train a PIX2PIX model using PyTorch. You will need torch, torchvision, onnx and onnxruntime installed.

```bash
pip install torch==2.4.0 torchvision==0.19.0 onnx==1.16.1 onnxruntime==1.19.0
```

Run the code with `python train.py --input_dir datasets/trees --output_dir output`.

```python
import glob
import torch
import torch.nn as nn
import torch.optim as optim
import torch.onnx
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from torchvision.utils import save_image
from PIL import Image
import os
import random
import argparse
from tqdm import tqdm


# Create the dataset class
class Pix2PixDataset(Dataset):
    def __init__(self, root_dir, transform=None):
        self.root_dir = root_dir
        self.transform = transform
        self.image_files = [
            f for f in os.listdir(root_dir) if f.endswith(".jpg") or f.endswith(".png")
        ]

    def __len__(self):
        return len(self.image_files)

    def __getitem__(self, idx):
        img_name = os.path.join(self.root_dir, self.image_files[idx])
        image = Image.open(img_name)

        # Split the image into input and target
        w, h = image.size
        target_image = image.crop((0, 0, w // 2, h))
        input_image = image.crop((w // 2, 0, w, h))

        if self.transform:
            input_image = self.transform(input_image)
            target_image = self.transform(target_image)

        return input_image, target_image


# Implement the UNet architecture for the generator
class UNetBlock(nn.Module):
    def __init__(self, in_channels, out_channels, down=True, bn=True, dropout=False):
        super(UNetBlock, self).__init__()
        self.conv = (
            nn.Conv2d(in_channels, out_channels, 4, 2, 1, bias=False)
            if down
            else nn.ConvTranspose2d(in_channels, out_channels, 4, 2, 1, bias=False)
        )
        self.bn = nn.BatchNorm2d(out_channels) if bn else None
        self.dropout = nn.Dropout(0.5) if dropout else None
        self.act = nn.LeakyReLU(0.2) if down else nn.ReLU()

    def forward(self, x):
        x = self.conv(x)
        if self.bn:
            x = self.bn(x)
        if self.dropout:
            x = self.dropout(x)
        return self.act(x)


class Generator(nn.Module):
    def __init__(self):
        super(Generator, self).__init__()
        self.down1 = UNetBlock(3, 64, down=True, bn=False)
        self.down2 = UNetBlock(64, 128)
        self.down3 = UNetBlock(128, 256)
        self.down4 = UNetBlock(256, 512)
        self.down5 = UNetBlock(512, 512)
        self.down6 = UNetBlock(512, 512)
        self.down7 = UNetBlock(512, 512)
        self.down8 = UNetBlock(512, 512, bn=False)

        self.up1 = UNetBlock(512, 512, down=False, dropout=True)
        self.up2 = UNetBlock(1024, 512, down=False, dropout=True)
        self.up3 = UNetBlock(1024, 512, down=False, dropout=True)
        self.up4 = UNetBlock(1024, 512, down=False)
        self.up5 = UNetBlock(1024, 256, down=False)
        self.up6 = UNetBlock(512, 128, down=False)
        self.up7 = UNetBlock(256, 64, down=False)

        self.final = nn.Sequential(nn.ConvTranspose2d(128, 3, 4, 2, 1), nn.Tanh())

    def forward(self, x):
        d1 = self.down1(x)
        d2 = self.down2(d1)
        d3 = self.down3(d2)
        d4 = self.down4(d3)
        d5 = self.down5(d4)
        d6 = self.down6(d5)
        d7 = self.down7(d6)
        d8 = self.down8(d7)

        u1 = self.up1(d8)
        u2 = self.up2(torch.cat([u1, d7], 1))
        u3 = self.up3(torch.cat([u2, d6], 1))
        u4 = self.up4(torch.cat([u3, d5], 1))
        u5 = self.up5(torch.cat([u4, d4], 1))
        u6 = self.up6(torch.cat([u5, d3], 1))
        u7 = self.up7(torch.cat([u6, d2], 1))
        return self.final(torch.cat([u7, d1], 1))


# Implement the discriminator
class Discriminator(nn.Module):
    def __init__(self):
        super(Discriminator, self).__init__()
        self.model = nn.Sequential(
            UNetBlock(6, 64, bn=False),
            UNetBlock(64, 128),
            UNetBlock(128, 256),
            UNetBlock(256, 512),
            nn.Conv2d(512, 1, 4, 1, 1),
            nn.Sigmoid(),
        )

    def forward(self, x, y):
        return self.model(torch.cat([x, y], 1))


# Define the loss functions and optimizers
criterion_gan = nn.BCELoss()
criterion_pixel = nn.L1Loss()


# Load snapshot if available
def get_latest_snapshot(output_dir):
    snapshots = glob.glob(os.path.join(output_dir, "snapshot_epoch_*.pth"))
    if not snapshots:
        return None
    return max(snapshots, key=os.path.getctime)


def load_snapshot(generator, discriminator, g_optimizer, d_optimizer, snapshot_path):
    checkpoint = torch.load(snapshot_path, map_location=device, weights_only=False)
    generator.load_state_dict(checkpoint["generator"])
    discriminator.load_state_dict(checkpoint["discriminator"])
    g_optimizer.load_state_dict(checkpoint["g_optimizer"])
    d_optimizer.load_state_dict(checkpoint["d_optimizer"])
    start_epoch = int(os.path.basename(snapshot_path).split("_")[2].split(".")[0])
    return start_epoch


# 6. Create the training loop
def train(generator, discriminator, dataloader, args):
    g_optimizer = optim.Adam(generator.parameters(), lr=0.0002, betas=(0.5, 0.999))
    d_optimizer = optim.Adam(discriminator.parameters(), lr=0.0002, betas=(0.5, 0.999))

    # Get fixed input/output for visualization
    fixed_set = next(iter(dataloader))
    fixed_input = fixed_set[0][0].unsqueeze(0)
    fixed_target = fixed_set[1][0].unsqueeze(0)
    # fixed_input = next(iter(dataloader))[0][0].unsqueeze(0)  # Get a fixed input for visualization

    start_epoch = 0
    if not args.restart:
        latest_snapshot = get_latest_snapshot(args.output_dir)
        if latest_snapshot:
            start_epoch = load_snapshot(
                generator, discriminator, g_optimizer, d_optimizer, latest_snapshot
            )
            print(f"Resuming training from epoch {start_epoch}")
        else:
            print("No snapshots found. Starting from scratch.")
    else:
        print("Restarting training from scratch.")

    for epoch in range(args.epochs):
        for i, (input_img, target_img) in enumerate(tqdm(dataloader)):
            input_img = input_img.to(device)
            target_img = target_img.to(device)

            # Train Discriminator
            d_optimizer.zero_grad()
            fake_img = generator(input_img)
            d_real = discriminator(input_img, target_img)
            d_fake = discriminator(input_img, fake_img.detach())
            d_loss_real = criterion_gan(d_real, torch.ones_like(d_real))
            d_loss_fake = criterion_gan(d_fake, torch.zeros_like(d_fake))
            d_loss = (d_loss_real + d_loss_fake) / 2
            d_loss.backward()
            d_optimizer.step()

            # Train Generator
            g_optimizer.zero_grad()
            fake_img = generator(input_img)
            d_fake = discriminator(input_img, fake_img)
            g_loss_gan = criterion_gan(d_fake, torch.ones_like(d_fake))
            g_loss_pixel = criterion_pixel(fake_img, target_img) * 100
            g_loss = g_loss_gan + g_loss_pixel
            g_loss.backward()
            g_optimizer.step()

            if i % args.sample_interval == 0:
                with torch.no_grad():
                    fake_img = generator(fixed_input.to(device))
                    img_sample = torch.cat(
                        (fixed_input.cpu(), fake_img.cpu(), fixed_target.cpu()), -1
                    )
                    save_image(
                        img_sample,
                        f"{args.output_dir}/epoch_{epoch}_iter_{i}.jpg",
                        nrow=3,
                        normalize=True,
                    )

        if (epoch + 1) % args.snapshot_interval == 0:
            torch.save(
                {
                    "generator": generator.state_dict(),
                    "discriminator": discriminator.state_dict(),
                    "g_optimizer": g_optimizer.state_dict(),
                    "d_optimizer": d_optimizer.state_dict(),
                },
                f"{args.output_dir}/snapshot_epoch_{epoch + 1}.pth",
            )

            # Save to ONNX format
            onnx_path = f"{args.output_dir}/generator_epoch_{epoch + 1}.onnx"
            generator.eval()
            dummy_input = torch.randn(1, 3, 512, 512).to(device)
            traced_script_module = torch.jit.trace(generator, dummy_input)
            torch.onnx.export(
                traced_script_module,
                dummy_input,
                onnx_path,
                export_params=True,
                opset_version=11,
                do_constant_folding=True,
                input_names=["input"],
                output_names=["output"],
                dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
            )
            print(f"ONNX model exported to {onnx_path}")
            generator.train()


# 7. Implement the argument parser for configuration
def parse_args():
    parser = argparse.ArgumentParser(
        description="Conditional GAN with pix2pix architecture"
    )
    parser.add_argument(
        "--input_dir",
        type=str,
        default="datasets/trees",
        help="Input dataset directory",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="output",
        help="Output directory for generated images",
    )
    parser.add_argument(
        "--sample_interval",
        type=int,
        default=100,
        help="Interval for saving sample images",
    )
    parser.add_argument(
        "--snapshot_interval",
        type=int,
        default=1,
        help="Interval for saving model snapshots",
    )
    parser.add_argument(
        "--epochs", type=int, default=200, help="Number of epochs to train"
    )
    parser.add_argument("--batch_size", type=int, default=8, help="Batch size")
    parser.add_argument(
        "--restart", action="store_true", help="Restart training from scratch"
    )
    return parser.parse_args()


# 8. Set up the main function to run the training
def main():
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    transform = transforms.Compose(
        [
            transforms.Resize((512, 512)),
            transforms.ToTensor(),
            transforms.Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5)),
        ]
    )

    dataset = Pix2PixDataset(args.input_dir, transform=transform)
    dataloader = DataLoader(
        dataset, batch_size=args.batch_size, shuffle=True, num_workers=4
    )

    generator = Generator().to(device)
    discriminator = Discriminator().to(device)

    train(generator, discriminator, dataloader, args)


if __name__ == "__main__":
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    main()
```
