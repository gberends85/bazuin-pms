import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './components/HomePage';
import { getContent } from './lib/content';

export const revalidate = 60;

export default async function Page() {
  const content = await getContent();
  return (
    <>
      <Header />
      <HomePage content={content} />
      <Footer content={content} />
    </>
  );
}
