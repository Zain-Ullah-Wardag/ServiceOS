import { env } from './config/env';
import app from './app';

const PORT = env.PORT || 4000;
app.listen(PORT, () => console.log(`ServiceOS API running on port ${PORT}`));
