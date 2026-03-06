---
title: "Null"
---

# Null

The Null node has no effect: it just passes input to output.

The reason the null node exists is as an organisational tool.
The node can be a single point where you can connect multiple other nodes to.

Often you have some processing of the input image, after which you want to do a number of things to it. The null node sits in the middle, avoiding you to have to reconnect all the nodes:

<img src="/img/nodes/null.jpg" alt="Figment null node setup"/>

If you now want to add another node after the "crop" node, you can put it in between the "crop" and "null" node, without having to reconnect all the nodes below it.
