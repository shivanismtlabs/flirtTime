import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const raw = [
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777038115111-998.gif?v=2', amount: 9, id: 401, type: 'coin', title: 'Watermelon', currency: 'coin', isActive: true, visualOrder: 1, createdAt: '2026-04-24T13:43:41.785Z', updatedAt: '2026-04-24T13:43:41.785Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777035560947-711.gif?v=2', amount: 9, id: 378, type: 'coin', title: 'Barbie', currency: 'coin', isActive: true, visualOrder: 29, createdAt: '2026-04-24T13:04:23.465Z', updatedAt: '2026-04-24T13:04:23.465Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777038043228-643.gif?v=2', amount: 11, id: 400, type: 'coin', title: 'Hen', currency: 'coin', isActive: true, visualOrder: 2, createdAt: '2026-04-24T13:41:41.086Z', updatedAt: '2026-04-24T13:41:41.086Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777271482188-543.gif?v=2', amount: 13, id: 397, type: 'coin', title: 'Red chilli', currency: 'coin', isActive: true, visualOrder: 3, createdAt: '2026-04-24T13:34:50.507Z', updatedAt: '2026-04-24T13:34:50.507Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777036896870-324.gif?v=2', amount: 18, id: 386, type: 'coin', title: 'Labubu', currency: 'coin', isActive: true, visualOrder: 4, createdAt: '2026-04-24T13:22:17.811Z', updatedAt: '2026-04-24T13:22:17.811Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775196535449-519.gif?v=2', amount: 19, id: 330, type: 'coin', title: 'I Love You', currency: 'coin', isActive: true, visualOrder: 5, createdAt: '2026-04-03T05:13:46.194Z', updatedAt: '2026-04-03T05:13:46.194Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775193724289-110.gif?v=2', amount: 21, id: 337, type: 'coin', title: 'Kiss', currency: 'coin', isActive: true, visualOrder: 6, createdAt: '2026-04-03T05:23:05.885Z', updatedAt: '2026-04-03T05:23:05.885Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775144237379-376.gif?v=2', amount: 23, id: 319, type: 'coin', title: 'Trump', currency: 'coin', isActive: true, visualOrder: 7, createdAt: '2026-04-02T15:38:28.118Z', updatedAt: '2026-04-02T15:38:28.118Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775197870440-751.gif?v=2', amount: 29, id: 347, type: 'coin', title: 'Money Gun', currency: 'coin', isActive: true, visualOrder: 8, createdAt: '2026-04-03T06:32:30.079Z', updatedAt: '2026-04-03T06:32:30.079Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775193395101-166.gif?v=2', amount: 33, id: 333, type: 'coin', title: 'Flower bouquet', currency: 'coin', isActive: true, visualOrder: 9, createdAt: '2026-04-03T05:17:41.647Z', updatedAt: '2026-04-03T05:17:41.648Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775193174030-157.gif?v=2', amount: 42, id: 331, type: 'coin', title: 'Heart', currency: 'coin', isActive: true, visualOrder: 10, createdAt: '2026-04-03T05:15:01.645Z', updatedAt: '2026-04-03T05:15:01.645Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775144473217-894.gif?v=2', amount: 44, id: 321, type: 'coin', title: 'Ferrari', currency: 'coin', isActive: true, visualOrder: 11, createdAt: '2026-04-02T15:42:24.777Z', updatedAt: '2026-04-02T15:42:24.777Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775200786723-451.gif?v=2', amount: 47, id: 370, type: 'coin', title: 'RM', currency: 'coin', isActive: true, visualOrder: 12, createdAt: '2026-04-03T07:21:01.731Z', updatedAt: '2026-04-03T07:21:01.731Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775198487997-200.gif?v=2', amount: 49, id: 356, type: 'coin', title: 'King', currency: 'coin', isActive: true, visualOrder: 13, createdAt: '2026-04-03T06:42:25.793Z', updatedAt: '2026-04-03T06:42:25.793Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037305496-910.gif?v=2', amount: 55, id: 391, type: 'coin', title: 'Fat Man', currency: 'coin', isActive: true, visualOrder: 19, createdAt: '2026-04-24T13:29:13.089Z', updatedAt: '2026-04-24T13:29:13.089Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775198266770-825.gif?v=2', amount: 56, id: 352, type: 'coin', title: 'High Heel', currency: 'coin', isActive: true, visualOrder: 16, createdAt: '2026-04-03T06:38:40.475Z', updatedAt: '2026-04-03T06:38:40.475Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777285360466-981.gif?v=2', amount: 57, id: 409, type: 'coin', title: 'Rocket', currency: 'coin', isActive: true, visualOrder: 13, createdAt: '2026-04-27T10:25:44.374Z', updatedAt: '2026-04-27T10:25:44.374Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777285592677-185.gif?v=2', amount: 58, id: 410, type: 'coin', title: 'Rose case', currency: 'coin', isActive: true, visualOrder: 17, createdAt: '2026-04-27T10:27:29.771Z', updatedAt: '2026-04-27T10:27:29.771Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775192873381-668.gif?v=2', amount: 59, id: 327, type: 'coin', title: 'Puppy with heart ', currency: 'coin', isActive: true, visualOrder: 14, createdAt: '2026-04-03T05:09:56.319Z', updatedAt: '2026-04-03T05:09:56.319Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775193311124-765.gif?v=2', amount: 61, id: 332, type: 'coin', title: 'Jar of hearts', currency: 'coin', isActive: true, visualOrder: 17, createdAt: '2026-04-03T05:16:20.869Z', updatedAt: '2026-04-03T05:16:20.869Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777036723832-671.gif?v=2', amount: 63, id: 384, type: 'coin', title: 'Mr Bean', currency: 'coin', isActive: true, visualOrder: 18, createdAt: '2026-04-24T13:19:31.818Z', updatedAt: '2026-04-24T13:19:31.818Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777038287669-476.gif?v=2', amount: 63, id: 403, type: 'coin', title: 'Fire', currency: 'coin', isActive: true, visualOrder: 15, createdAt: '2026-04-24T13:45:35.709Z', updatedAt: '2026-04-24T13:45:35.709Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037097088-467.gif?v=2', amount: 66, id: 389, type: 'coin', title: 'Zombie', currency: 'coin', isActive: true, visualOrder: 21, createdAt: '2026-04-24T13:26:36.466Z', updatedAt: '2026-04-24T13:26:36.466Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775198327065-358.gif?v=2', amount: 67, id: 353, type: 'coin', title: 'Champagne ', currency: 'coin', isActive: true, visualOrder: 22, createdAt: '2026-04-03T06:39:38.827Z', updatedAt: '2026-04-03T06:39:38.827Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037704839-580.gif?v=2', amount: 68, id: 398, type: 'coin', title: 'ATM', currency: 'coin', isActive: true, visualOrder: 20, createdAt: '2026-04-24T13:36:57.147Z', updatedAt: '2026-04-24T13:36:57.147Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777036042232-695.gif?v=2', amount: 72, id: 379, type: 'coin', title: 'Skeleton', currency: 'coin', isActive: true, visualOrder: 21, createdAt: '2026-04-24T13:08:10.808Z', updatedAt: '2026-04-24T13:08:10.808Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775202063391-294.gif?v=2', amount: 73, id: 376, type: 'coin', title: 'Luck', currency: 'coin', isActive: true, visualOrder: 23, createdAt: '2026-04-03T07:41:59.560Z', updatedAt: '2026-04-03T07:41:59.560Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775199367440-344.gif?v=2', amount: 81, id: 358, type: 'coin', title: 'Conor McGregor', currency: 'coin', isActive: true, visualOrder: 24, createdAt: '2026-04-03T06:58:27.921Z', updatedAt: '2026-04-03T06:58:27.921Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777038486398-844.gif?v=2', amount: 83, id: 406, type: 'coin', title: 'Tennis', currency: 'coin', isActive: true, visualOrder: 25, createdAt: '2026-04-24T13:48:46.580Z', updatedAt: '2026-04-24T13:48:46.580Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777036392954-603.gif?v=2', amount: 89, id: 382, type: 'coin', title: 'Donut', currency: 'coin', isActive: true, visualOrder: 28, createdAt: '2026-04-24T13:14:56.274Z', updatedAt: '2026-04-24T13:14:56.275Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775192779268-441.gif?v=2', amount: 91, id: 326, type: 'coin', title: 'Joker', currency: 'coin', isActive: true, visualOrder: 27, createdAt: '2026-04-03T05:07:26.931Z', updatedAt: '2026-04-03T05:07:26.931Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775144366483-281.gif?v=2', amount: 94, id: 320, type: 'coin', title: 'Happy birthday ', currency: 'coin', isActive: true, visualOrder: 26, createdAt: '2026-04-02T15:40:20.127Z', updatedAt: '2026-04-02T15:40:20.127Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777036960378-565.gif?v=2', amount: 96, id: 387, type: 'coin', title: 'thumbsup', currency: 'coin', isActive: true, visualOrder: 32, createdAt: '2026-04-24T13:23:32.035Z', updatedAt: '2026-04-24T13:23:32.035Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037524348-181.gif?v=2', amount: 97, id: 395, type: 'coin', title: 'Music', currency: 'coin', isActive: true, visualOrder: 30, createdAt: '2026-04-24T13:32:46.411Z', updatedAt: '2026-04-24T13:32:46.411Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777036165770-630.gif?v=2', amount: 103, id: 380, type: 'coin', title: 'Pink Tiger', currency: 'coin', isActive: true, visualOrder: 31, createdAt: '2026-04-24T13:10:41.014Z', updatedAt: '2026-04-24T13:10:41.014Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775200124097-314.gif?v=2', amount: 107, id: 366, type: 'coin', title: 'Dior', currency: 'coin', isActive: true, visualOrder: 35, createdAt: '2026-04-03T07:10:50.313Z', updatedAt: '2026-04-03T07:10:50.313Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037580311-540.gif?v=2', amount: 112, id: 396, type: 'coin', title: 'Hand Heart', currency: 'coin', isActive: true, visualOrder: 33, createdAt: '2026-04-24T13:33:44.086Z', updatedAt: '2026-04-24T13:33:44.086Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775201549913-624.gif?v=2', amount: 116, id: 374, type: 'coin', title: 'Wellness', currency: 'coin', isActive: true, visualOrder: 34, createdAt: '2026-04-03T07:27:44.935Z', updatedAt: '2026-04-03T07:27:44.935Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037833752-127.gif?v=2', amount: 118, id: 399, type: 'coin', title: 'Bird', currency: 'coin', isActive: true, visualOrder: 37, createdAt: '2026-04-24T13:40:24.149Z', updatedAt: '2026-04-24T13:40:24.149Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037428844-913.gif?v=2', amount: 121, id: 393, type: 'coin', title: 'Coffee', currency: 'coin', isActive: true, visualOrder: 38, createdAt: '2026-04-24T13:31:16.314Z', updatedAt: '2026-04-24T13:31:16.314Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037369174-611.gif?v=2', amount: 123, id: 392, type: 'coin', title: 'Nemo Fish', currency: 'coin', isActive: true, visualOrder: 36, createdAt: '2026-04-24T13:30:17.436Z', updatedAt: '2026-04-24T13:30:17.436Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037493810-386.gif?v=2', amount: 126, id: 394, type: 'coin', title: 'Mermaid', currency: 'coin', isActive: true, visualOrder: 39, createdAt: '2026-04-24T13:32:02.381Z', updatedAt: '2026-04-24T13:32:02.381Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775199858938-210.gif?v=2', amount: 128, id: 362, type: 'coin', title: 'Tiger', currency: 'coin', isActive: true, visualOrder: 44, createdAt: '2026-04-03T07:05:18.622Z', updatedAt: '2026-04-03T07:05:18.622Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775144622208-818.gif?v=2', amount: 129, id: 322, type: 'coin', title: 'Onevibe', currency: 'coin', isActive: true, visualOrder: 40, createdAt: '2026-04-02T15:44:49.592Z', updatedAt: '2026-04-02T15:44:49.592Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777038580782-326.gif?v=2', amount: 134, id: 408, type: 'coin', title: 'ButterFly', currency: 'coin', isActive: true, visualOrder: 41, createdAt: '2026-04-24T13:50:15.084Z', updatedAt: '2026-04-24T13:50:15.084Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777038536416-453.gif?v=2', amount: 137, id: 407, type: 'coin', title: 'Basket Ball', currency: 'coin', isActive: true, visualOrder: 42, createdAt: '2026-04-24T13:49:32.400Z', updatedAt: '2026-04-24T13:49:32.400Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775198221656-477.gif?v=2', amount: 139, id: 351, type: 'coin', title: 'Marry Me', currency: 'coin', isActive: true, visualOrder: 46, createdAt: '2026-04-03T06:37:43.794Z', updatedAt: '2026-04-03T06:37:43.794Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777036245829-821.gif?v=2', amount: 142, id: 381, type: 'coin', title: 'jet ski', currency: 'coin', isActive: true, visualOrder: 47, createdAt: '2026-04-24T13:12:44.113Z', updatedAt: '2026-04-24T13:12:44.113Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777038429091-366.gif?v=2', amount: 143, id: 405, type: 'coin', title: 'New Hat', currency: 'coin', isActive: true, visualOrder: 43, createdAt: '2026-04-24T13:47:52.342Z', updatedAt: '2026-04-24T13:47:52.342Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775197221179-756.gif?v=2', amount: 146, id: 341, type: 'coin', title: 'MOney in bag', currency: 'coin', isActive: true, visualOrder: 45, createdAt: '2026-04-03T06:22:24.424Z', updatedAt: '2026-04-03T06:22:24.424Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775196276685-840.gif?v=2', amount: 147, id: 339, type: 'coin', title: 'Habibi come Dubai', currency: 'coin', isActive: true, visualOrder: 48, createdAt: '2026-04-03T06:05:43.151Z', updatedAt: '2026-04-03T06:05:43.151Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775143172423-556.gif?v=2', amount: 148, id: 318, type: 'coin', title: 'Ronaldo', currency: 'coin', isActive: true, visualOrder: 50, createdAt: '2026-04-02T15:32:07.047Z', updatedAt: '2026-04-02T15:32:07.047Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037020797-997.gif?v=2', amount: 151, id: 388, type: 'coin', title: 'Panda', currency: 'coin', isActive: true, visualOrder: 49, createdAt: '2026-04-24T13:24:35.254Z', updatedAt: '2026-04-24T13:24:35.254Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775197820179-666.gif?v=2', amount: 152, id: 346, type: 'coin', title: 'IBA', currency: 'coin', isActive: true, visualOrder: 51, createdAt: '2026-04-03T06:31:06.575Z', updatedAt: '2026-04-03T06:31:06.575Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775200255664-472.gif?v=2', amount: 156, id: 367, type: 'coin', title: 'Channel', currency: 'coin', isActive: true, visualOrder: 52, createdAt: '2026-04-03T07:11:50.244Z', updatedAt: '2026-04-03T07:11:50.244Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775199983923-182.gif?v=2', amount: 159, id: 364, type: 'coin', title: 'Miu Miu', currency: 'coin', isActive: true, visualOrder: 54, createdAt: '2026-04-03T07:07:33.434Z', updatedAt: '2026-04-03T07:07:33.435Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775200879449-949.gif?v=2', amount: 161, id: 371, type: 'coin', title: 'G63', currency: 'coin', isActive: true, visualOrder: 53, createdAt: '2026-04-03T07:22:11.204Z', updatedAt: '2026-04-03T07:22:11.205Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777038235832-331.gif?v=2', amount: 163, id: 402, type: 'coin', title: 'Swaggy Man', currency: 'coin', isActive: true, visualOrder: 55, createdAt: '2026-04-24T13:44:37.921Z', updatedAt: '2026-04-24T13:44:37.921Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775193037730-943.gif?v=2', amount: 167, id: 328, type: 'coin', title: 'Panda', currency: 'coin', isActive: true, visualOrder: 56, createdAt: '2026-04-03T05:11:16.129Z', updatedAt: '2026-04-03T05:11:16.129Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775200936612-509.gif?v=2', amount: 169, id: 372, type: 'coin', title: 'RR', currency: 'coin', isActive: true, visualOrder: 58, createdAt: '2026-04-03T07:24:24.285Z', updatedAt: '2026-04-03T07:24:24.285Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775201072086-638.gif?v=2', amount: 172, id: 373, type: 'coin', title: 'Boat', currency: 'coin', isActive: true, visualOrder: 57, createdAt: '2026-04-03T07:25:20.464Z', updatedAt: '2026-04-03T07:25:20.464Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775193078351-744.gif?v=2', amount: 174, id: 329, type: 'coin', title: 'Baby Boss', currency: 'coin', isActive: true, visualOrder: 59, createdAt: '2026-04-03T05:12:38.266Z', updatedAt: '2026-04-03T05:12:38.266Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775198383088-747.gif?v=2', amount: 178, id: 354, type: 'coin', title: 'Hat', currency: 'coin', isActive: true, visualOrder: 60, createdAt: '2026-04-03T06:40:33.911Z', updatedAt: '2026-04-03T06:40:33.911Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775199752669-945.gif?v=2', amount: 179, id: 361, type: 'coin', title: 'Wolf', currency: 'coin', isActive: true, visualOrder: 62, createdAt: '2026-04-03T07:04:09.506Z', updatedAt: '2026-04-03T07:04:09.506Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775201868004-585.gif?v=2', amount: 182, id: 375, type: 'coin', title: 'Lambo', currency: 'coin', isActive: true, visualOrder: 61, createdAt: '2026-04-03T07:28:52.626Z', updatedAt: '2026-04-03T07:28:52.627Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775197953145-850.gif?v=2', amount: 182, id: 348, type: 'coin', title: 'Pirate Boat', currency: 'coin', isActive: true, visualOrder: 63, createdAt: '2026-04-03T06:33:26.337Z', updatedAt: '2026-04-03T06:33:26.337Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775144859822-716.gif?v=2', amount: 187, id: 324, type: 'coin', title: 'Helicopter', currency: 'coin', isActive: true, visualOrder: 64, createdAt: '2026-04-02T15:48:36.331Z', updatedAt: '2026-04-02T15:48:36.331Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777037225526-350.gif?v=2', amount: 188, id: 390, type: 'coin', title: 'Candle', currency: 'coin', isActive: true, visualOrder: 66, createdAt: '2026-04-24T13:28:04.257Z', updatedAt: '2026-04-24T13:28:04.258Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775198552294-633.gif?v=2', amount: 191, id: 357, type: 'coin', title: 'Dragon', currency: 'coin', isActive: true, visualOrder: 65, createdAt: '2026-04-03T06:56:01.716Z', updatedAt: '2026-04-03T06:56:01.716Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777036811866-740.gif?v=2', amount: 193, id: 385, type: 'coin', title: 'Teddy', currency: 'coin', isActive: true, visualOrder: 67, createdAt: '2026-04-24T13:21:02.898Z', updatedAt: '2026-04-24T13:21:02.898Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775197147834-638.gif?v=2', amount: 197, id: 340, type: 'coin', title: 'Cake', currency: 'coin', isActive: true, visualOrder: 68, createdAt: '2026-04-03T06:20:14.434Z', updatedAt: '2026-04-03T06:20:14.434Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775197530327-252.gif?v=2', amount: 199, id: 342, type: 'coin', title: 'Crown', currency: 'coin', isActive: true, visualOrder: 70, createdAt: '2026-04-03T06:26:30.405Z', updatedAt: '2026-04-03T06:26:30.405Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775197594393-405.gif?v=2', amount: 201, id: 343, type: 'coin', title: 'Start', currency: 'coin', isActive: true, visualOrder: 69, createdAt: '2026-04-03T06:27:39.979Z', updatedAt: '2026-04-03T06:27:39.980Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775199560971-416.gif?v=2', amount: 203, id: 360, type: 'coin', title: 'Snake', currency: 'coin', isActive: true, visualOrder: 71, createdAt: '2026-04-03T07:02:28.592Z', updatedAt: '2026-04-03T07:02:28.592Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775197665905-633.gif?v=2', amount: 207, id: 344, type: 'coin', title: 'UFC', currency: 'coin', isActive: true, visualOrder: 72, createdAt: '2026-04-03T06:28:56.162Z', updatedAt: '2026-04-03T06:28:56.162Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775198437695-647.gif?v=2', amount: 209, id: 355, type: 'coin', title: 'Bitcoin', currency: 'coin', isActive: true, visualOrder: 74, createdAt: '2026-04-03T06:41:24.957Z', updatedAt: '2026-04-03T06:41:24.957Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775202848553-741.gif?v=2', amount: 211, id: 377, type: 'coin', title: 'AP', currency: 'coin', isActive: true, visualOrder: 73, createdAt: '2026-04-03T07:54:50.913Z', updatedAt: '2026-04-03T07:54:50.913Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775198010034-113.gif?v=2', amount: 214, id: 349, type: 'coin', title: 'Dubai City', currency: 'coin', isActive: true, visualOrder: 75, createdAt: '2026-04-03T06:36:05.222Z', updatedAt: '2026-04-03T06:36:05.222Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775200320951-561.gif?v=2', amount: 218, id: 368, type: 'coin', title: 'Rolex', currency: 'coin', isActive: true, visualOrder: 76, createdAt: '2026-04-03T07:15:58.522Z', updatedAt: '2026-04-03T07:15:58.522Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775144781076-577.gif?v=2', amount: 219, id: 323, type: 'coin', title: 'Hurcan', currency: 'coin', isActive: true, visualOrder: 78, createdAt: '2026-04-02T15:47:23.594Z', updatedAt: '2026-04-02T15:47:23.594Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775200057945-651.gif?v=2', amount: 222, id: 365, type: 'coin', title: 'LV', currency: 'coin', isActive: true, visualOrder: 77, createdAt: '2026-04-03T07:08:39.703Z', updatedAt: '2026-04-03T07:08:39.703Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775191927268-234.gif?v=2', amount: 223, id: 325, type: 'coin', title: 'Champion', currency: 'coin', isActive: true, visualOrder: 79, createdAt: '2026-04-03T05:00:02.506Z', updatedAt: '2026-04-03T05:00:02.506Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775198168706-552.gif?v=2', amount: 227, id: 350, type: 'coin', title: 'Ring', currency: 'coin', isActive: true, visualOrder: 80, createdAt: '2026-04-03T06:36:57.741Z', updatedAt: '2026-04-03T06:36:57.742Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775199927832-152.gif?v=2', amount: 229, id: 363, type: 'coin', title: 'Lion', currency: 'coin', isActive: true, visualOrder: 82, createdAt: '2026-04-03T07:06:14.636Z', updatedAt: '2026-04-03T07:06:14.636Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775200598998-915.gif?v=2', amount: 231, id: 369, type: 'coin', title: 'Patek', currency: 'coin', isActive: true, visualOrder: 81, createdAt: '2026-04-03T07:17:28.704Z', updatedAt: '2026-04-03T07:17:28.704Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777038347402-775.gif?v=2', amount: 234, id: 404, type: 'coin', title: 'Ice Cream', currency: 'coin', isActive: true, visualOrder: 83, createdAt: '2026-04-24T13:46:53.447Z', updatedAt: '2026-04-24T13:46:53.447Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1777036545843-103.gif?v=2', amount: 238, id: 383, type: 'coin', title: 'slot machine', currency: 'coin', isActive: true, visualOrder: 84, createdAt: '2026-04-24T13:16:59.621Z', updatedAt: '2026-04-24T13:16:59.621Z', deletedAt: null },
  { icon: 'https://app.onevibe.ai/chat-media/24868882-0dbf-4d46-ba7b-69fb94f616a3/1775196675100-194.gif?v=2', amount: 9999, id: 336, type: 'coin', title: 'Cat', currency: 'coin', isActive: true, visualOrder: 85, createdAt: '2026-04-03T05:21:39.493Z', updatedAt: '2026-04-03T05:21:39.493Z', deletedAt: null },
]

const rows = raw.map((g) => ({
  id: g.id,
  uuid: randomUUID(),
  type: g.type,
  title: g.title,
  icon: g.icon,
  amount: g.amount,
  currency: g.currency,
  is_active: g.isActive,
  visual_order: g.visualOrder,
  deleted_at: g.deletedAt,
  created_at: g.createdAt,
  updated_at: g.updatedAt,
}))

mkdirSync('d:/onevibe/database/seeders/gifts', { recursive: true })

const catalogSrc = `import type { Knex } from 'knex';

/** OneVibe gift catalog rows (production snapshot). */
export type GiftSeedRow = {
  id: number;
  uuid: string;
  type: string;
  title: string;
  icon: string;
  amount: number;
  currency: string;
  is_active: boolean;
  visual_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export const GIFT_CATALOG_SEED: GiftSeedRow[] = ${JSON.stringify(rows, null, 2)};

export async function seedGiftsCatalog(knex: Knex): Promise<number> {
  await knex('gifts').del();
  const batchSize = 50;
  for (let i = 0; i < GIFT_CATALOG_SEED.length; i += batchSize) {
    await knex('gifts').insert(GIFT_CATALOG_SEED.slice(i, i + batchSize));
  }
  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('gifts', 'id'), COALESCE((SELECT MAX(id) FROM gifts), 1))",
  );
  return GIFT_CATALOG_SEED.length;
}
`

writeFileSync('d:/onevibe/database/seeders/gifts/catalog.ts', catalogSrc)

const seedSrc = `/**
 * Gift catalog seeder.
 *
 *   npm run db:seed:gifts
 */
import type { Knex } from 'knex';
import { seedGiftsCatalog } from '../seeders/gifts/catalog.js';

export async function seed(knex: Knex): Promise<void> {
  const count = await seedGiftsCatalog(knex);
  console.log(\`Seeded \${count} gifts\`);
}
`

writeFileSync('d:/onevibe/database/seeds/02_gifts.ts', seedSrc)
console.log('wrote', rows.length, 'gifts')
