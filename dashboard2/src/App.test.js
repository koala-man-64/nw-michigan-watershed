import { render, screen } from '@testing-library/react';
import App from './App';

test('renders header with NW Michigan Watershed Coalition', () => {
  render(<App />);
  const headerElement = screen.getByText(/NW Michigan Watershed Coalition/i);
  expect(headerElement).toBeInTheDocument();
});
